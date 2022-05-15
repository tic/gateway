// Allows data to be submitted to the SIF
// time-series data storage platform.

const mqtt = require("mqtt");
const ACI = require("amazon-cognito-identity-js");

var config = {};
var idToken = null;
var refreshInterval = null;
var cognitoUser = null;
var broker = null;

async function refreshToken() {
    cognitoUser.authenticateUser(
        new ACI.AuthenticationDetails({
            Username: config.username,
            Password: config.password
        }),
        {
            onSuccess: function(result) {
                const token = result.getIdToken().getJwtToken();
                console.info("[%d] refreshed sif token", new Date().getTime() / 1000);
                idToken = token;
            },
            onFailure: function(err) {
                console.error(err);
            }
        }
    );
}

async function drain(app_name, metrics, metadata={}, timestamp=Date.now(), device_id=null) {
    if(app_name === undefined || app_name === null) {
        console.error("sink 'sif' requires non-null app name");
        return;
    }

    if(metrics === undefined || metrics === null) {
        console.error("sink 'sif' requires non-null metrics");
        return;
    }

    const blob = {
        app_name: app_name,
        token: idToken,
        data: {
            timestamp: timestamp,
            device: device_id,
            metadata: metadata,
            metrics: metrics
        }
    };

    broker.publish(
        "data/ingest/passthrough",
        JSON.stringify(blob)
    );
}

module.exports = {
    drain: drain,
    setup: async configIn => {
        config = configIn;
        cognitoUser = new ACI.CognitoUser({
            Username: config.username,
            Pool: new ACI.CognitoUserPool({
                UserPoolId: config.userPoolId,
                ClientId: config.clientId
            })
        });

        broker = mqtt.connect("mqtt://broker.uvasif.org");

        // Refresh the token every 58 minutes (tokens valid for 1hr)
        refreshToken();
        refreshInterval = setInterval(refreshToken, 3480000);
    },
    cleanup: async () => {
        clearInterval(refreshInterval);
    }
};
