/// <reference path="./lib/phaser.d.ts"/>
import {Delaunay} from "./delaunay";
import {dset, geom, setDefault, reservoirSample} from "./util";

const enum Kind {
    HIDDEN, NORMAL, FORBIDDEN
}

class Door {
    constructor(public x: number, public y: number, public one: Room, public other: Room) {
        one.doors.push(this);
        other.doors.push(this);
    };

    getOther(one: Room): Room {
        return (this.one === one) ? this.other : this.one;
    }
}

class Room {
    static maxID: number = 0;
    static neighbourhood = {};

    id: number;
    parent: Room = null;
    child1: Room = null;
    child2: Room = null;
    kind: Kind = Kind.FORBIDDEN;
    doors: Door[] = [];

    constructor(public rect: Phaser.Rectangle) {
        this.id = Room.maxID++;
    };

    connected(other: Room): boolean {
        for (var door of this.doors) {
            if (door.other === other || door.one === other) return true;
        }
        return false;
    }

    get neighbors(): Room[] {
        let result = Room.neighbourhood[this.id];
        if (result === undefined) {
            return [];
        }
        return result;
    }

    addNeighbor(other: Room) {
        var array1 = <Array<Room>> setDefault(Room.neighbourhood, this.id, () => []);
        if (array1.indexOf(other) >= 0) return;
        array1.push(other);
        var array2 = <Array<Room>> setDefault(Room.neighbourhood, other.id, () => []);
        if (array2.indexOf(this) < 0) {
            array2.push(this);
        }
    }

    isNeighbors(other: Room): boolean {
        let neighbors = Room.neighbourhood[this.id];
        if (neighbors === undefined) {
            return false;
        }
        return neighbors.indexOf(other) >= 0;
    }
}

namespace walker {
    export class Node {
        visited = false;
        distance = 0;
        key = 0;
        treasure = 0;
        enemies = 0;
    }

    export class Entry {
        constructor(public from: Room, public to: Room) {};
    }
}

class Walker {
    nodes: {} = {};
    keyLinks: {} = {};
    keyLevel: number = 0;
    treasures: Room[] = [];
    enemies: Room[] = [];
    locks: Door[] = [];

    constructor(public rooms: Room[], public rng: Phaser.RandomDataGenerator) {
        for (let room of rooms) {
            this.nodes[room.id] = new walker.Node();
        }
    }

    process(from: Room, room: Room, node: walker.Node) {
        if (room.doors.length === 1) {
            this.treasures.push(room);
            node.treasure = this.rng.between(1, 3);
        }
        if (this.rng.between(1, 4) < room.doors.length) {
            this.enemies.push(room);
            node.enemies = this.rng.between(1, room.doors.length * 1.5);
        }
        if (from !== null && room.doors.length >= 2 && this.rng.frac() > 0.7) {
            let door = this.rng.pick(room.doors.filter((door) => door.getOther(room) !== from));
            this.locks.push(door);
            this.nodes[door.getOther(room).id].key = ++this.keyLevel;
            this.keyLinks[this.keyLevel] = node.key;
        }
    }

    walk(start: Room = this.rooms[0]) {
        let queue: walker.Entry[] = [new walker.Entry(null, start)];
        while (queue.length) {
            let entry = queue.shift(),
                room = entry.to,
                node = this.nodes[room.id],
                thisWalker = this;

            this.process(entry.from, room, node);
            room.eachConnected(function(conRoom) {
                let conNode = thisWalker.nodes[conRoom.id];
                if (conNode.visited) return;
                conNode.visited = true;
                conNode.distance = node.distance + 1;
                conNode.key = conNode.key || node.key;
                queue.push(new walker.Entry(room, conRoom));
            });
        }
    }
}

export class Agroprom {
    rng: Phaser.RandomDataGenerator = new Phaser.RandomDataGenerator([(Date.now() * Math.random()).toString()]);
    rooms: Room[] = [];
    queue: Room[] = [];
    spanVertices: Phaser.Point[] = [];
    spanEdges: Phaser.Line[] = [];

    constructor(public width: number, public height: number) {};

    generateDungeon() {
        var root = new Room(new Phaser.Rectangle(0, 0, this.width, this.height));
        this.queue.push(root);
        while (this.queue.length) {
            let current = this.queue.shift();
            if (!this.checkRoom(current)) {
                this.rooms.push(current);
                continue;
            }
            let slice = this.getSlice(current.rect);
            this.divide(current, slice);
        }

        let spanNum = this.rng.between(3, Math.max(3, this.rooms.length / 3));

        for (let room of reservoirSample(this.rooms, spanNum, this.rng)) {
            this.spanVertices.push(new Phaser.Point(room.rect.centerX, room.rect.centerY).ceil());
        }

        var delaunay = new Delaunay();
        delaunay.triangulate(this.spanVertices, true);
        this.spanEdges = delaunay.kruskal();

        for (let edge of this.spanEdges) {
            for (let room of this.rooms) {
                if (geom.lineIntersectsRect(edge, room.rect)) {
                    room.kind = Kind.NORMAL;
                }
            }
        }

        let roomsDset = new dset.Dset<Room>(this.rooms, (room) => room.id),
            intersection = new Phaser.Rectangle(0, 0, 0, 0);

        for (let one of this.rooms) {
            for (let other of this.rooms) {
                if (one === other) continue;
                if (one.isNeighbors(other)) continue;
                intersection.setTo(-1, 0, 0, 0);
                one.rect.intersection(other.rect, intersection);
                if (intersection.x < 0) continue;
                one.addNeighbor(other);
                if (intersection.width < 3 && intersection.height < 3) continue;
                if (one.kind === Kind.FORBIDDEN || other.kind === Kind.FORBIDDEN) continue;
                if (roomsDset.disjoint(one, other)) {
                    roomsDset.union(one, other);
                    new Door(
                        intersection.width ? intersection.x + this.rng.between(1, intersection.width - 2) : intersection.x,
                        intersection.height ? intersection.y + this.rng.between(1, intersection.height - 2) : intersection.y,
                        one, other
                    );
                }
            }
        }
    }

    private checkRoom(room: Room): boolean {
        return room.rect.volume > 70;
    }

    private getSlice(rect: Phaser.Rectangle): Phaser.Line {
        var rectangularity = rect.width / rect.height,
            vertical = rectangularity < 1,
            dimension = vertical ? rect.height : rect.width,
            offset = Math.ceil((dimension / 4) + this.rng.between(0, dimension / 4));

        if (vertical) {
            return new Phaser.Line(rect.left, rect.y + offset, rect.right, rect.y + offset);
        }
        return new Phaser.Line(rect.x + offset, rect.top, rect.x + offset, rect.bottom);
    }

    private divide(room: Room, slice: Phaser.Line) {
        var one: Phaser.Rectangle, other: Phaser.Rectangle,
            rect = room.rect;

        if (slice.left === slice.right) {
            one = geom.rectangleFromCoords(rect.left, rect.top, slice.x, rect.bottom);
            other = geom.rectangleFromCoords(slice.x - 1, rect.top, rect.right, rect.bottom);
        } else {
            one = geom.rectangleFromCoords(rect.left, rect.top, rect.right, slice.y);
            other = geom.rectangleFromCoords(rect.left, slice.y - 1, rect.right, rect.bottom);
        }
        if (one.width < 3 || one.height < 3 || other.width < 3 || other.height < 3) {
            this.rooms.push(room);
            return;
        }
        var rone = new Room(one),
            rother = new Room(other);

        rone.parent = room;
        rother.parent = room;
        room.child1 = rone;
        room.child2 = rother;

        this.queue.push(rone);
        this.queue.push(rother);
    }

    debugDraw(game: Phaser.Game, scale: number) {
        for (var room of this.rooms) {
            if (room.kind === Kind.FORBIDDEN) continue;
            for (var x = room.rect.left; x < room.rect.right; x++) {
                for (var y = room.rect.top; y < room.rect.bottom; y++) {
                    game.debug.geom(new Phaser.Rectangle(x * scale, y * scale, scale, scale), 'rgba(0, 162, 255, 0.1)', false);
                }
            }
            for (var point of geom.rectanglePerimeter(room.rect)) {
                game.debug.geom(new Phaser.Rectangle(point.x * scale, point.y * scale, scale, scale), '#00436a', true);
            }
            for (var door of room.doors) {
                game.debug.geom(new Phaser.Rectangle(door.x * scale, door.y * scale, scale, scale), 'rgba(255, 47, 0, 0.5)', true);
            }
        }
        for (var ver of this.spanVertices) {
            game.debug.geom(new Phaser.Circle(ver.x * scale, ver.y * scale, 5), '#FF2F00');
        }
        for (var edge of this.spanEdges) {
            game.debug.geom(new Phaser.Line(edge.start.x * scale, edge.start.y * scale,
                                            edge.end.x * scale, edge.end.y * scale), 'rgba(255, 47, 0, 0.3)');
        }
    }
}
