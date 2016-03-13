/// <reference path="phaser.d.ts"/>
import {Delaunay} from "./delaunay";
import {geom} from "./util";

const enum Kind {
    HIDDEN, NORMAL
}

class Room {
    parent: Room = null;
    child1: Room = null;
    child2: Room = null;
    kind: Kind = Kind.HIDDEN;

    constructor(public rect: Phaser.Rectangle) {};
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
            if (this.checkMain(current)) {
                this.result.push(current);
                this.spanVertices.push(new Phaser.Point(current.rect.centerX, current.rect.centerY).ceil());
                continue;
            }
            if (!this.checkRoom(current)) {
                this.result.push(current);
                continue;
            }
            var slice = this.getSlice(current.rect);
            this.divide(current, slice);
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
    }

    private checkMain(room: Room): boolean {
        return this.rng.between(0, 100) < 10;
    }

    private checkRoom(room: Room): boolean {
        return room.rect.volume > 70;
    }

    private getSlice(rect: Phaser.Rectangle): Phaser.Line {
        var rectangularity = rect.width / rect.height,
            vertical = rectangularity < 1,
            dimension = vertical ? rect.height : rect.width,
            offset = (dimension / 4) + this.rng.between(0, dimension / 4);

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
            var rect = new Phaser.Rectangle(
                room.rect.left * scale, room.rect.top * scale,
                room.rect.width * scale, room.rect.height * scale
            );
            game.debug.geom(rect, '#00A2FF', false);
        }
        for (var ver of this.spanVertices) {
            game.debug.geom(new Phaser.Circle(ver.x * scale, ver.y * scale, 5), '#FF2F00');
        }
        for (var edge of this.spanEdges) {
            game.debug.geom(new Phaser.Line(edge.start.x * scale, edge.start.y * scale,
                                            edge.end.x * scale, edge.end.y * scale), '#FF2F00');
        }
    }
}
