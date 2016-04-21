/// <reference path="./lib/phaser.d.ts"/>

type kilogram = number;
type meter = number;
type newton = number;

export interface Material {

}

export const enum DeformationType {
    ELASTIC, PLASTIC, FRACTURE
}

export class Deformation {
    constructor(public type: DeformationType, public amount: number = 0) {};
}

export class HardMaterial implements Material {
    private static zero: Phaser.Point = new Phaser.Point(0, 0);
    // https://en.wikipedia.org/wiki/Strength_of_materials
    // https://en.wikipedia.org/wiki/Toughness
    toughness: number;
    // https://en.wikipedia.org/wiki/Hardness
    hardness: number;
    // https://en.wikipedia.org/wiki/Ductility
    ductility: number;
    strength: number;
    // https://en.wikipedia.org/wiki/Ultimate_tensile_strength
    tensileStrength: number;
    // https://en.wikipedia.org/wiki/Compressive_strength
    compressiveStrength: number;
    // https://en.wikipedia.org/wiki/Shear_strength
    shearStrength: number;

    curve: Phaser.Point[];

    apply(force: newton, area: meter): number {
        let begin: Phaser.Point = null,
            end = this.curve[1],
            stress = force / area;

        if (stress <= this.curve[0].y) {
            return 0;
        }
        if (stress > this.tensileStrength) {
            return -1;
        }

        for (let idx = 1; idx < this.curve.length; idx++) {
            let point = this.curve[idx];
            begin = end;
            end = point;
            if (stress > end.y) continue;
            let slope = (end.y - begin.y) / (end.x - begin.x);
            // y = mx + b
            // x = (y - b) / m
            return begin.x + (stress - begin.y) / slope;
        }
        return -1;
    }
}