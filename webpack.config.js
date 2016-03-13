var path = require("path");

module.exports = {

    entry: "./imports.js",

    output: {
        path: __dirname + "/build",
        filename: "bundle.js"
    },

    module: {
        loaders: [
            { test: /pixi\.(min\.)?js$/i, loader: "script" },
            { test: /phaser\.(min\.)?js$/i, loader: "script" }
        ]
    },

    resolve: {
        alias: {
            phaser: path.join(__dirname, "./lib/phaser.min.js"),
            pixi: path.join(__dirname, "./lib/pixi.min.js")
        }
    }

};
