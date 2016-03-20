/// <reference path="./lib/phaser.d.ts"/>
import {Delaunay} from "./delaunay";
import {geom, setDefault} from "./util";

const enum Kind {
    HIDDEN, NORMAL, FORBIDDEN
}

class Door {
    static maxID: number = 0;
    id: number;
    disabled: boolean = false;

    constructor(public x: number, public y: number, public one: Room, public other: Room) {
        this.id = Door.maxID++;
    };
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
            if (door.disabled) continue;
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

export class Agroprom {
    rng: Phaser.RandomDataGenerator = new Phaser.RandomDataGenerator([(Date.now() * Math.random()).toString()]);
    result: Room[] = [];
    rooms: Room[] = [];
    spanVertices: Phaser.Point[] = [];
    spanEdges: Phaser.Line[] = [];

    constructor(public width: number, public height: number) {};

    generateDungeon() {
        var root = new Room(new Phaser.Rectangle(0, 0, this.width, this.height));
        this.rooms.push(root);
        while (this.rooms.length) {
            let current = this.rooms.shift();
            if (!this.checkRoom(current)) {
                this.result.push(current);
                continue;
            }
            let slice = this.getSlice(current.rect);
            this.divide(current, slice);
        }

        let spanNum = this.rng.between(3, Math.max(3, this.result.length / 3)),
            processed = [],
            origins = {};

        while (spanNum) {
            let room = this.rng.pick(this.result);
            if (processed.indexOf(room) >= 0) continue;
            spanNum--;
            processed.push(room);
            let point = new Phaser.Point(room.rect.centerX, room.rect.centerY).ceil();
            this.spanVertices.push(point);
            origins[point.toString()] = room;
        }

        var delaunay = new Delaunay();
        delaunay.triangulate(this.spanVertices, true);
        this.spanEdges = delaunay.kruskal();

        for (let edge of this.spanEdges) {
            for (let room of this.result) {
                if (geom.lineIntersectsRect(edge, room.rect)) {
                    room.kind = Kind.NORMAL;
                }
            }
        }

        let intersection = new Phaser.Rectangle(0, 0, 0, 0);

        for (let one of this.result) {
            for (let other of this.result) {
                if (one === other) continue;
                if (one.isNeighbors(other)) continue;
                intersection.setTo(-1, 0, 0, 0);
                one.rect.intersection(other.rect, intersection);
                //if (one.rect.intersects(other.rect)) {
                if (intersection.x < 0) continue;
                one.addNeighbor(other);
                if (intersection.width < 3 && intersection.height < 3) continue;
                if (one.kind === Kind.FORBIDDEN || other.kind === Kind.FORBIDDEN) continue;
                var door = new Door(
                    intersection.width ? intersection.x + this.rng.between(1, intersection.width - 2) : intersection.x,
                    intersection.height ? intersection.y + this.rng.between(1, intersection.height - 2) : intersection.y,
                    one, other);
                one.doors.push(door);
                other.doors.push(door);
            }
        }

        function isConnected(one: Room, other: Room, processed: Room[] = []): boolean {
            if (one.connected(other)) return true;
            for (let room of one.neighbors) {
                if (room === other) return false;
                if (room.kind !== Kind.NORMAL) continue;
                if (processed.indexOf(room) >= 0) continue;
                processed.push(room);
                if (isConnected(room, other, processed)) return true;
            }
            return false;
        }

        for (let room of this.result) {
            Phaser.ArrayUtils.shuffle(Room.neighbourhood[room.id]);
        }
        let removed = 0;
        for (let room of this.result) {
            for (let n1 of room.neighbors) {
                if (!room.connected(n1)) continue;
                for (let n2 of room.neighbors) {
                    if (n1 === n2) continue;
                    if (!n1.connected(n2) || !room.connected(n2)) continue;
                    let r = (this.rng.sign() > 1) ? room : n1;
                    for (let door of r.doors) {
                        if ((door.one === r && door.other === n2) || (door.one === n2 && door.other === r)) {
                            door.disabled = true;
                            removed++;
                        }
                    }
                }
            }
            //for (let door of room.doors) {
            //    if (door.disabled) continue;
            //    let other = (door.one === room) ? door.other : door.one;
            //    door.disabled = true;
            //    if (!isConnected(room, other)) {
            //        door.disabled = false;
            //    } else {
            //        removed++;
            //    }
            //}
        }
        console.log(removed);
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
            this.result.push(room);
            return;
        }
        var rone = new Room(one),
            rother = new Room(other);

        rone.parent = room;
        rother.parent = room;
        room.child1 = rone;
        room.child2 = rother;

        this.rooms.push(rone);
        this.rooms.push(rother);
    }

    debugDraw(game: Phaser.Game, scale: number) {
        for (var room of this.result) {
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
                if (door.disabled) continue;
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
