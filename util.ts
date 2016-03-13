/// <reference path="phaser.d.ts"/>

export namespace dset {
    class Node<T> {
        parent: Node<T>;
        rank: number;
        constructor(public data) {
            this.parent = this;
            this.rank = 0;
        }
    }

    export class Dset<T> {
        private data: {} = {};

        constructor(entries: T[]) {
            for (var entry of entries) {
                this.data[entry.toString()] = new Node(entry);
            }
        }

        find(entry: T): Node<T> {
            var node = this.data[entry.toString()];
            while (node.parent.data != node.data) {
                node.parent = node.parent.parent;
                node = node.parent;
            }
            return node;
        }

        disjoint(one: T, other: T): boolean {
            return this.find(one).data !== this.find(other).data;
        }

        union(one: T, other: T) {
            var n1 = this.find(one),
                n2 = this.find(other);

            if (n1.data === n2.data) return;

            if (n1.rank < n2.rank) {
                n1.parent = n2.parent;
            } else if (n2.rank < n1.rank) {
                n2.parent = n1.parent;
            } else {
                n2.parent = n1;
                n1.rank++;
            }
        }
    }
}

export namespace geom {
    export function isCCW(a: Phaser.Point, b: Phaser.Point, c: Phaser.Point): boolean {
        return (a.x - b.x) * (b.y - c.y) > (a.y - b.y) * (b.x - c.x);
    }

    export function det33(...m): number {
        var det33 = 0;
        det33 += m[0] * (m[4] * m[8] - m[5] * m[7]);
        det33 -= m[1] * (m[3] * m[8] - m[5] * m[6]);
        det33 += m[2] * (m[3] * m[7] - m[4] * m[6]);
        return det33;
    }

    export function inCircle(a: Phaser.Point, b: Phaser.Point, c: Phaser.Point, d: Phaser.Point): boolean {
        var a2 = a.x * a.x + a.y * a.y,
            b2 = b.x * b.x + b.y * b.y,
            c2 = c.x * c.x + c.y * c.y,
            d2 = d.x * d.x + d.y * d.y,

            det44 = 0;

        det44 += d2 * det33(a.x, a.y, 1, b.x, b.y, 1, c.x, c.y, 1);
        det44 -= d.x * det33(a2, a.y, 1, b2, b.y, 1, c2, c.y, 1);
        det44 += d.y * det33(a2, a.x, 1, b2, b.x, 1, c2, c.x, 1);
        det44 -= det33(a2, a.x, a.y, b2, b.x, b.y, c2, c.x, c.y);

        return det44 < 0;
    }

    export function onSegment(origin: Phaser.Point, destination: Phaser.Point, point: Phaser.Point): boolean {
        return (point.x - origin.x) * (point.y - destination.y) == (point.y - origin.y) * (point.x - destination.x);
    }

    export function rectangleFromCoords(x1: number, y1: number, x2: number, y2: number): Phaser.Rectangle {
        return new Phaser.Rectangle(
            Math.min(x1, x2),
            Math.min(y1, y2),
            Math.abs(x2 - x1),
            Math.abs(y2 - y1)
        );
    }

    export function lineIntersectsRect(line: Phaser.Line, rect: Phaser.Rectangle): boolean {
        if (rect.left > line.right || rect.right < line.left) return false;
        if (rect.top > line.bottom || rect.bottom < line.top) return false;

        var m = line.slope,
            leftY = m * (rect.left - line.start.x) + line.start.y,
            rightY = m * (rect.right - line.start.x) + line.start.y;

        if (rect.top > leftY && rect.top > rightY) return false;
        if (rect.bottom < leftY && rect.bottom < rightY) return false;
        return true;
    }
}

export function removeElement<T>(array: T[], element: T): T {
    var i = array.indexOf(element);
    return (i === -1) ? null : array.splice(i, 1)[0];
}
