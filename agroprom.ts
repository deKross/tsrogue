/// <reference path="./lib/phaser.d.ts"/>
import {Delaunay} from "./delaunay";
import {geom, setDefault} from "./util";

const enum Kind {
    HIDDEN, NORMAL
}

class Door {
    constructor(public x: number, public y: number, public one: Room, public other: Room) {};
}

class Room {
    static maxID: number = 0;
    id: number;
    parent: Room = null;
    child1: Room = null;
    child2: Room = null;
    kind: Kind = Kind.HIDDEN;
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
            var current = this.rooms.shift();
            if (!this.checkRoom(current)) {
                this.result.push(current);
                continue;
            }
            var slice = this.getSlice(current.rect);
            this.divide(current, slice);
        }

        var spanNum = this.rng.between(3, Math.max(3, this.result.length / 3)),
            processed = [];

        while (spanNum) {
            var room = this.rng.pick(this.result);
            if (processed.indexOf(room) >= 0) continue;
            processed.push(room);
            spanNum--;
            this.spanVertices.push(new Phaser.Point(room.rect.centerX, room.rect.centerY).ceil());
        }

        var neighbourhood = {};
        for (var room1 of this.result) {
            var array1 = <Array<Room>> setDefault(neighbourhood, room1.id, () => new Array<Room>());
            for (var room2 of this.result) {
                if (room1 === room2) continue;
                if (room1.rect.intersects(room2.rect, 1)) {
                    if (array1.indexOf(room2) >= 0) continue;
                    array1.push(room2);
                    var array2 = <Array<Room>> setDefault(neighbourhood, room2.id, () => Array<Room>());
                    if (array2.indexOf(room1) < 0) {
                        array2.push(room1);
                    }
                }
            }
        }

        var delaunay = new Delaunay();
        delaunay.triangulate(this.spanVertices, true);
        this.spanEdges = delaunay.kruskal();

        for (var edge of this.spanEdges) {
            for (var room of this.result) {
                if (geom.lineIntersectsRect(edge, room.rect)) {
                    room.kind = Kind.NORMAL;
                }
            }
        }

        var intersection = new Phaser.Rectangle(0, 0, 0, 0);
        for (var room of this.result) {
            if (room.kind === Kind.HIDDEN) continue;
            for (var neighbor of neighbourhood[room.id]) {
                if (neighbor.kind === Kind.HIDDEN) continue;
                if (room.connected(neighbor)) continue;
                room.rect.intersection(neighbor.rect, intersection);
                if (intersection.width < 3 && intersection.height < 3) continue;
                var door = new Door(
                    intersection.width ? intersection.x + this.rng.between(1, intersection.width - 2) : intersection.x,
                    intersection.height ? intersection.y + this.rng.between(1, intersection.height - 2) : intersection.y,
                    room, neighbor);
                room.doors.push(door);
                neighbor.doors.push(door);
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
            one = geom.rectangleFromCoords(rect.left, rect.top, slice.x - 1, rect.bottom);
            other = geom.rectangleFromCoords(slice.x - 1, rect.top, rect.right, rect.bottom);
        } else {
            one = geom.rectangleFromCoords(rect.left, rect.top, rect.right, slice.y - 1);
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
            if (room.kind === Kind.HIDDEN) continue;
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
