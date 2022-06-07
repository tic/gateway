'use strict';

// Quick replacement to automatically add timestamps
// to all calls to `console.info`. The timestamp is
// colored differently to indicate it is not a part
// of the actual arguments to `console.info`.
/* Colors:  Reset = "\x1b[0m"
            Bright = "\x1b[1m"
            Dim = "\x1b[2m"
            Underscore = "\x1b[4m"
            Blink = "\x1b[5m"
            Reverse = "\x1b[7m"
            Hidden = "\x1b[8m"

            FgBlack = "\x1b[30m"
            FgRed = "\x1b[31m"
            FgGreen = "\x1b[32m"
            FgYellow = "\x1b[33m"
            FgBlue = "\x1b[34m"
            FgMagenta = "\x1b[35m"
            FgCyan = "\x1b[36m"
            FgWhite = "\x1b[37m"

            BgBlack = "\x1b[40m"
            BgRed = "\x1b[41m"
            BgGreen = "\x1b[42m"
            BgYellow = "\x1b[43m"
            BgBlue = "\x1b[44m"
            BgMagenta = "\x1b[45m"
            BgCyan = "\x1b[46m"
            BgWhite = "\x1b[47m"
//*/
// Source: https://stackoverflow.com/questions/9781218/how-to-change-node-jss-console-font-color
const info = console.info;
console.info = function() {
    process.stdout.write(`\x1b[1m[\x1b[31m${Date.now() / 1000}\x1b[0m\x1b[1m]\x1b[0m `);
    info.apply(this, arguments)
}


// Load the config for all sources and sinks
const reloadConfig = require("./config").getConfig
const globalConfig = reloadConfig();

if(globalConfig.disableSinks) {
    console.info("! ALL SINKS DISABLED !");
}

// Load sinks
const fs = require("fs");
var sinkLoadTime = -Date.now();
var sinks = (async () => {
    const sinkFiles = await fs.promises.readdir("./sinks");
    const sinkNames = (await Promise.all(
        sinkFiles.map(async sinkFile => {
            const stat = await fs.promises.stat("./sinks/" + sinkFile);
            const regexp = /^(.*)\.js$/i;
            if(stat.isDirectory() || !regexp.test(sinkFile)) {
                return undefined;
            }
            return regexp.exec(sinkFile)[1];
        })
    )).filter(s => s!== undefined);

    const sinkConfigs = globalConfig.sinks;
    return sinkNames.reduce(
        async (sinkDict, sinkName) => {
            try {
                const sinkController = require("./sinks/" + sinkName);
                if(globalConfig.disableSinks === true) {
                    sinkController.drain = async function() {
                        console.info("skipped sink for destination '%s'", sinkName);
                    };
                }
                await sinkController.setup(sinkConfigs[sinkName] ?? {});
                sinkDict[sinkName] = sinkController;
            } catch(err) {
                console.error("failed to initialize sink '%s' (%s)", sinkName, err);
            }
            return sinkDict;
        },
        {}
    );
})();

sinks.then(sinks => {
    sinkLoadTime += Date.now();
    const numSinks = Object.keys(sinks);
    console.log(
        "> loaded %d sink%s in %ds",
        numSinks.length,
        numSinks.length === 1 ? "s" : "",
        (sinkLoadTime / 1000).toFixed(3)
    );
});

// Load sources
var sourceLoadTime = -Date.now();
const sources = (async () => {
    sinks = await sinks;
    const sourceFiles = await fs.promises.readdir("./sources");
    const sourceNames = (await Promise.all(
        sourceFiles.map(async sourceFile => {
            const regexp = /^(.*)\.js$/i;
            if(!regexp.test(sourceFile)) {
                return undefined;
            }

            const sourceName = regexp.exec(sourceFile)[1];
            if(globalConfig.sourceWhitelist.length > 0 && !globalConfig.sourceWhitelist.includes(sourceName)) {
                return undefined;
            }

            const stat = await fs.promises.stat("./sources/" + sourceFile);
            if(stat.isDirectory()) {
                return undefined;
            }
            
            return sourceName;
        })
    )).filter(s => s!== undefined);

    const sourceConfigs = globalConfig.sources;
    return sourceNames.reduce(
        async (sourceDict, sourceName) => {
            try {
                const sourceController = require("./sources/" + sourceName);
                await sourceController.setup(sourceConfigs[sourceName], sinks);
                sourceDict[sourceName] = sourceController;
            } catch(err) {
                console.error("failed to initialize source '%s' (%s)", sourceName, err);
            }
            return sourceDict;
        },
        {}
    );
})();

sources.then(sources => {
    sourceLoadTime += Date.now();
    const numSources = Object.keys(sources);
    console.log(
        "> loaded %d source%s in %ds",
        numSources.length,
        numSources.length === 1 ? "s" : "",
        (sourceLoadTime / 1000).toFixed(3)
    );
});
