// Load the config for all sources and sinks
const reloadConfig = require("./config").getConfig
const globalConfig = reloadConfig();

// Load sinks
const fs = require("fs");
var sinkLoadTime = -Date.now();
const sinks = (async () => {
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
                console.log(sinkConfigs[sinkName]);
                await sinkController.setup(sinkConfigs[sinkName]);
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
        numSinks.length > 1 ? "s" : "",
        (sinkLoadTime / 1000).toFixed(3)
    );
});
