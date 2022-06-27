const http = require("http");
var server, sinks = {};

const interpreters = {
    "sif": data => {
        if(
            data.app_name === undefined ||
            typeof data.app_name !== "string" ||
            data.metrics === undefined ||
            typeof data.metrics !== "object" ||
            data.metadata === undefined ||
            typeof data.metadata !== "object"
        ) {
            throw new HttpInputError(HttpInputError.FORMAT_ERROR);
        };
        return [data.app_name, data.metrics, data.metadata];
    }
};

class HttpInputError extends Error {

    static get UNSUPPORTED_METHOD() { return 0 };
    static get NONCOMPLIANT_REQUEST() { return 1 };
    static get UNKNOWN_FORMAT() { return 2 };
    static get FORMAT_ERROR() { return 3 };

    static get errorMessages() {
        return {
            [this.UNSUPPORTED_METHOD]: "the gateway does not support this http method",
            [this.NONCOMPLIANT_REQUEST]: "the gateway only accepts requests with a JSON body containing keys format<string> and data<Record<string, any>>",
            [this.UNKNOWN_FORMAT]: `unknown data format. the gateway understands these formats: ${Object.keys(interpreters).join(", ")}`,
            [this.FORMAT_ERROR]: "a formatting error is present in the provided body"
        };
    };

    constructor(errType, message="the gateway failed to process the request") {
        message = HttpInputError.errorMessages[errType] ?? message;
        super(message);
        switch(errType) {
            case HttpInputError.UNSUPPORTED_METHOD:
                console.info("[http] unsupported method");
                break;
            case HttpInputError.NONCOMPLIANT_REQUEST:
                console.info("[http] noncompliant request");
                break;
            case HttpInputError.UNKNOWN_FORMAT:
                console.info("[http] unknown format");
                break;
            case HttpInputError.FORMAT_ERROR:
                console.info("[http] format error");
                break;
        }
    }
}

async function requestHandler(request, response) {
    try {
        switch(request.method) {
            case "POST":
                const { format, data } = await new Promise(resolve => {
                    request.on("data", data => {
                        let parsedBody = {};
                        try {
                            parsedBody = JSON.parse(data.toString());
                        } catch {
                        } finally {
                            resolve(parsedBody);
                        }
                    });
                });

                if(
                    format === undefined ||
                    data === undefined ||
                    typeof data !== "object"
                ) {
                    throw new HttpInputError(HttpInputError.NONCOMPLIANT_REQUEST);
                }

                const interpreter = interpreters[format];
                if(interpreter === undefined) {
                    throw new HttpInputError(HttpInputError.UNKNOWN_FORMAT);
                }

                const processed = interpreter(data);
                sinks.sif.drain(...processed);
                break;
            default:
                throw new HttpInputError(HttpInputError.UNSUPPORTED_METHOD);

        }
    } catch(err) {
        if(err instanceof HttpInputError) {
            response.write(JSON.stringify({
                message: err.message
            }));
        } else {
            console.error(err);
        }
    } finally {
        response.end();
    }
}

module.exports = {
    setup: async (configIn, sinksIn) => {
        sinks = sinksIn;
        server = http.createServer(requestHandler);
        server.listen(configIn.serverPort);
    },
    cleanup: async () => {
        server.close();
    }
}
