/// <reference path="phaser.d.ts"/>
import {geom, dset, removeElement} from "./util";

class QuadEdge {
    orig: Phaser.Point;
    onext: QuadEdge;
    rot: QuadEdge;
    private _mark: boolean;

    constructor(origin?: Phaser.Point, destination?: Phaser.Point) {
        this.orig = origin;
        if (destination === undefined) {
            return;
        }
        var q0 = this,
            q1 = new QuadEdge(),
            q2 = new QuadEdge(destination),
            q3 = new QuadEdge;

        q0.onext = q0; q2.onext = q2;
        q1.onext = q3; q3.onext = q1;

        q0.rot = q1; q1.rot = q2;
        q2.rot = q3; q3.rot = q0;
    }

    get marked(): boolean { return this._mark; }
    mark() { this._mark = true; }
    unmark() { this._mark = false; }

    get dest(): Phaser.Point { return this.rot.rot.orig; }
    get sym(): QuadEdge { return this.rot.rot; }
    get rotSym(): QuadEdge { return this.rot.rot.rot; }
    get oprev(): QuadEdge { return this.rot.onext.rot; }
    get dprev(): QuadEdge { return this.rot.rot.rot.onext.rot.rot.rot; }
    get lnext(): QuadEdge { return this.rot.rot.rot.onext.rot; }
    get lprev(): QuadEdge { return this.onext.rot.rot; }

    splice(b: QuadEdge) {
        var a = this,
            alpha = a.onext.rot,
            beta = b.onext.rot,

            t1 = b.onext,
            t2 = a.onext,
            t3 = beta.onext,
            t4 = alpha.onext;

        a.onext = t1;
        b.onext = t2;
        alpha.onext = t3;
        beta.onext = t4;
    }

    connect(b: QuadEdge): QuadEdge {
        var r = new QuadEdge(this.dest, b.orig);
        r.splice(this.lnext);
        r.sym.splice(b);
        return r;
    }

    swap() {
        var a = this.oprev,
            b = this.sym.oprev;

        this.splice(a);
        this.sym.splice(b);
        this.splice(a.lnext);
        this.sym.splice(b.lnext);
        this.orig = a.dest;
        this.sym.orig = b.dest;
    }

    remove() {
        this.splice(this.oprev);
        this.sym.splice(this.sym.oprev);
    }

    hasPoint(point: Phaser.Point): boolean {
        return geom.onSegment(this.orig, this.dest, point);
    }

    pointAtRight(point: Phaser.Point): boolean {
        return geom.isCCW(point, this.dest, this.orig);
    }
}

class SimpleEdge {
    constructor(public origin: Phaser.Point, public destination: Phaser.Point, public weight: number) {};
}

export class Delaunay {
    private current: QuadEdge;
    edges: QuadEdge[] = [];
    vertices: Phaser.Point[] = [];
    private bbox: Phaser.Rectangle;
    rng: Phaser.RandomDataGenerator = new Phaser.RandomDataGenerator(undefined);

    locate(point: Phaser.Point, edge: QuadEdge): QuadEdge {
        // Peter J.C. Brown, Christopher T. Faigle, "A robust efficient algorithm for point location in triangulations"
        if (edge.pointAtRight(point)) {
            edge = edge.sym;
        }
        while (true) {
            if (point.equals(edge.orig) || point.equals(edge.dest)) {
                return edge;
            }
            var op = 0;
            if (!edge.onext.pointAtRight(point)) {
                op += 1;
            }
            if (!edge.dprev.pointAtRight(point)) {
                op += 2;
            }
            switch (op) {
                case 0:
                    return edge;
                case 1:
                    edge = edge.onext;
                    break;
                case 2:
                    edge = edge.dprev;
                    break;
                case 3:
                    if (this.dist(edge.onext, point) < this.dist(edge.dprev, point)) {
                        edge = edge.onext;
                    } else {
                        edge = edge.dprev;
                    }
            }
        }
    }

    dist(edge: QuadEdge, point: Phaser.Point): number {
        return this.rng.integer();
    }

    private calculateBbox(points: Phaser.Point[]): Phaser.Rectangle {
        var p = points.shift(),
            min_x = p.x, max_x = p.x, min_y = p.y, max_y = p.y;

        for (var point of points) {
            min_x = Math.min(min_x, point.x);
            max_x = Math.max(max_x, point.x);
            min_y = Math.min(min_y, point.y);
            max_y = Math.max(max_y, point.y);
        }
        return geom.rectangleFromCoords(min_x - 100, min_y - 100, max_x + 100, max_y + 100);
    }

    setBbox(bbox: Phaser.Rectangle) {
        this.bbox = bbox;

        var ab = new QuadEdge(bbox.bottomLeft, bbox.bottomRight),
            bc = new QuadEdge(bbox.bottomRight, bbox.topRight),
            cd = new QuadEdge(bbox.topRight, bbox.topLeft),
            da = new QuadEdge(bbox.topLeft, bbox.bottomLeft);

        ab.sym.splice(bc);
        bc.sym.splice(cd);
        cd.sym.splice(da);
        da.sym.splice(ab);

        this.current = ab;
    }

    triangulate(points: Phaser.Point[], storeVertices=false) {
        this.setBbox(this.calculateBbox(points));
        if (storeVertices) {
            this.vertices = points.slice();
        }
        for (var point of points) {
            this.insertPoint(point);
        }
    }

    insertPoint(point: Phaser.Point) {
        var edge = this.locate(point, this.current);

        if (point.equals(edge.orig) || point.equals(edge.dest)) {
            return;
        }

        if (edge.hasPoint(point)) {
            var temp = edge.oprev;
            edge.remove();
            removeElement(this.edges, edge);
            removeElement(this.edges, edge.sym);
            edge = temp;
        }

        var base = new QuadEdge(edge.orig, point);
        this.edges.push(base);
        base.splice(edge);

        this.current = base;
        do {
            base = edge.connect(base.sym);
            this.edges.push(base);
            edge = base.oprev;
        } while (edge.lnext != this.current);

        while (true) {
            var temp = edge.oprev;

            if (edge.pointAtRight(temp.dest) && geom.inCircle(edge.orig, temp.dest, edge.dest, point)) {
                edge.swap();
                edge = edge.oprev;
            } else if (edge.onext == this.current) {
                return;
            } else {
                edge = edge.onext.lprev;
            }
        }
    }

    processTriangles(processor: (a: Phaser.Point, b: Phaser.Point, c: Phaser.Point) => void) {
        for (var q of this.edges) {
            q.unmark();
            q.sym.unmark();
            if (q.orig.equals(this.bbox.topLeft) || q.orig.equals(this.bbox.topRight) ||
                    q.orig.equals(this.bbox.bottomRight) || q.orig.equals(this.bbox.bottomLeft)) {
                q.mark();
            }
            if (q.dest.equals(this.bbox.topLeft) || q.dest.equals(this.bbox.topRight) ||
                    q.dest.equals(this.bbox.bottomRight) || q.dest.equals(this.bbox.bottomLeft)) {
                q.sym.mark();
            }
        }
        for (var edge of this.edges) {
            var q1 = edge,
                q2 = q1.lnext,
                q3 = q2.lnext;

            if (!q1.marked && !q2.marked && !q3.marked) {
                processor(q1.orig, q2.orig, q3.orig);
            }

            var qs1 = edge.sym,
                qs2 = qs1.lnext,
                qs3 = qs2.lnext;

            if (!qs1.marked && !qs2.marked && !qs3.marked) {
                processor(qs1.orig, qs2.orig, qs3.orig);
            }

            edge.mark();
            edge.sym.mark();
        }
    }

    get triangles(): Phaser.Polygon[] {
        var triangles = [];
        this.processTriangles((A: Phaser.Point, B: Phaser.Point, C: Phaser.Point) => triangles.push(new Phaser.Polygon(A, B, C)));
        return triangles;
    }

    get simpleEdges(): SimpleEdge[] {
        var edges = [],
            out = new Phaser.Point();

        this.processTriangles((A: Phaser.Point, B: Phaser.Point, C: Phaser.Point) => {
            edges.push(new SimpleEdge(A, B, Phaser.Point.subtract(B, A, out).getMagnitudeSq()));
            edges.push(new SimpleEdge(B, C, Phaser.Point.subtract(C, B, out).getMagnitudeSq()));
            edges.push(new SimpleEdge(C, A, Phaser.Point.subtract(A, C, out).getMagnitudeSq()));
        });
        return edges;
    }

    kruskal(minimum=true): Phaser.Line[] {
        if (this.vertices.length === 0) {
            return;
        }
        var edges = this.simpleEdges,
            result: Phaser.Line[] = [];

        if (minimum) {
            edges.sort((one: SimpleEdge, other: SimpleEdge) => one.weight - other.weight);
        } else {
            edges.sort((one: SimpleEdge, other: SimpleEdge) => other.weight - one.weight);
        }
        var vertices_dset = new dset.Dset<Phaser.Point>(this.vertices);
        while (edges.length) {
            var edge = edges.shift(),
                orig = edge.origin,
                dest = edge.destination;

            if (vertices_dset.disjoint(orig, dest)) {
                vertices_dset.union(orig, dest);
                result.push(new Phaser.Line(orig.x, orig.y, dest.x, dest.y));
            }
        }
        return result;
    }
}
