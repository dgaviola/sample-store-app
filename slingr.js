// utilities

var urlParamsToObject = function () {
    var hash = window.top.location.hash;
    var params = {};
    if (hash && hash.length > 0) {
        var queryParamsParts = hash.split('?');
        if (queryParamsParts.length > 0) {
            var queryParams = queryParamsParts[1];
            if (queryParams) {
                params = JSON.parse('{"' + decodeURIComponent(queryParams).replace(/"/g, '\\"').replace(/&/g, '","').replace(/=/g,'":"') + '"}');
            }
        }
    }
    return params;
};

if (typeof jQuery !== 'undefined') {
    // this is required to support cross-domain AJAX calls on IE 9
    $.support.cors = true;

    var sys = sys || {};
    if (!sys.ws) {
        sys.ws = {};
    }
    if (!sys.ui) {
        sys.ui = {};
    }
    if (!sys.context) {
        sys.context = {};
    }
    sys.ws.TOKEN = null;
    sys.ws.API_URL = null;
    sys.ws.HEADERS = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    };
    sys.ws._messageSource = null;
    sys.ws._messageOrigin = null;

    // we have to listen for 'message'
    window.addEventListener('message', function (messageEvent) {

        if (typeof messageEvent.data == 'object') {
            return;// sending from web sockets - ping/pong
        }

        var action = messageEvent.data.split('=')[0];
        sys.ws._messageSource = messageEvent.source;
        sys.ws._messageOrigin = messageEvent.origin;

        if (action == 'HEIGHT_ACTION') {
            sys.ws._messageSource.postMessage('HEIGHT_ACTION=' + document.body.scrollHeight, sys.ws._messageOrigin);
            // The first time we ask for height we also add a listener for 'DOM mutations' son we can post a message with the new body height
            window.addEventListener("DOMSubtreeModified", function () {
                sys.ui.resizeContainer(document.body.scrollHeight);
            }, false);
        }

        if (action == 'SET_TOKEN_ACTION') {
            //On this action we don't need top post any response message. We need to set the token to be used on subsequent API request headers.
            var token = messageEvent.data.split('=')[1];
            sys.ws.TOKEN = token;
            sys.ws.HEADERS.token = token;
        }
        if (action == 'SET_API_URL_ACTION') {
            //On this action we don't need top post any response message. We need to set the token to be used on subsequent API request headers.
            var url = messageEvent.data.split('=')[1];
            sys.ws.API_URL = url;
        }
    }, false);

    ///////////////////////////////////////////////////////////////////////////////////////////////
    // GENERIC LIBRARY TO HELP ACCESSING WEB SERVICES
    ///////////////////////////////////////////////////////////////////////////////////////////////

    sys.ws.OPTIONS_TTL = 5000;

    // Generic WS methods

    sys.ws.get = function (urlOrParams, done, error) {
        var url, params;
        if (typeof urlOrParams === 'object') {
            url = urlOrParams.url;
            params = urlOrParams.params;
        } else {
            url = urlOrParams;
        }
        sys.ws.getAjaxOptions(url, done, error, function (options) {
            options['type'] = 'GET';
            if (params) {
                options['data'] = params;
            }
            $.ajax(options);
        });
    };

    sys.ws.post = function (urlOrParams, data, done, error) {
        var url, params;
        if (typeof urlOrParams === 'object') {
            url = urlOrParams.url;
            params = urlOrParams.params;
        } else {
            url = urlOrParams;
        }
        if (params) {
            url = url + '?' + $.param(params);
        }
        sys.ws.getAjaxOptions(url, done, error, function (options) {
            options['type'] = 'POST';
            options['data'] = sys.ws.stringifyData(data);
            $.ajax(options);
        });
    };

    sys.ws.put = function (urlOrParams, data, done, error) {
        var url, params;
        if (typeof urlOrParams === 'object') {
            url = urlOrParams.url;
            params = urlOrParams.params;
        } else {
            url = urlOrParams;
        }
        if (params) {
            url = url + '?' + $.param(params);
        }
        sys.ws.getAjaxOptions(url, done, error, function (options) {
            options['type'] = 'PUT';
            options['data'] = sys.ws.stringifyData(data);
            $.ajax(options);
        });
    };

    sys.ws.del = function (urlOrParams, done, error) {
        var url, params;
        if (typeof urlOrParams === 'object') {
            url = urlOrParams.url;
            params = urlOrParams.params;
        } else {
            url = urlOrParams;
        }
        if (params) {
            url = url + '?' + $.param(params);
        }
        sys.ws.getAjaxOptions(url, done, error, function (options) {
            options['type'] = 'DELETE';
            $.ajax(options);
        });
    };

    sys.ws.getAjaxOptions = function (url, done, error, callback) {
        if (!sys.ws.TOKEN) {
            // if token is not set yet, we might need to wait a bit
            setTimeout(function () {
                sys.ws.getAjaxOptions(url, done, error, callback);
            }, 500);
            return;
        }
        sys.ws.HEADERS['token'] = sys.ws.TOKEN;
        var options = {
            url: sys.ws.buildUrl(url),
            headers: sys.ws.HEADERS,
            success: sys.ws.successHandler(done),
            error: sys.ws.errorHandler(error),
            cache: true
        };
        callback(options);
    };

    sys.ws.stringifyData = function (data) {
        if (typeof data !== 'string') {
            return JSON.stringify(data);
        } else {
            return data;
        }
    };

    sys.ws.jsonifyData = function (data) {
        if (typeof data === 'string') {
            return JSON.parse(data);
        } else {
            return data;
        }
    };

    sys.ws.buildUrl = function (url) {
        if (!url) {
            return sys.ws.API_URL;
        } else if (url.indexOf('/') === 0) {
            return sys.ws.API_URL + url;
        } else {
            return sys.ws.API_URL + '/' + url;
        }
    };

    sys.ws.successHandler = function (successCallback) {
        return function (res, textStatus, request) {
            successCallback(sys.ws.jsonifyData(res), textStatus);
        }
    };

    sys.ws.errorHandler = function (errorCallback) {
        return function (jqXhr, textStatus, errorThrown) {
            var errorCode = "unkown";
            var errorMessage = "";
            if (textStatus == 'timeout') {
                errorCode = "timeout";
                errorMessage = "Timeout tying to access the server. Please check your internet connection.";
            } else {
                try {
                    var res = JSON.parse(jqXhr.responseText);
                    errorCode = res.code;
                    errorMessage = res.message;
                } catch (err) {
                    errorMessage = "Unknown error. Please contact support.";
                    if (!jqXhr.responseText) {
                        /* the ajax call was aborted by the browser because there is no response */
                        return;
                    }
                }
            }
            var errorInfo = {
                'code': errorCode,
                'message': errorMessage
            };
            if (errorCode == 'validationErrors') {
                errorInfo['errors'] = res.errors;
            }
            errorCallback(errorInfo, textStatus);
        };
    };

    sys.ui.goToView = function (viewIdOrName, params) {
        var message = viewIdOrName;
        if (params) {
            message = message + '&' + JSON.stringify(params);
        }
        sys.ws._messageSource.postMessage('GO_TO_VIEW_ACTION=' + message, sys.ws._messageOrigin);
    };

    sys.ui.resizeContainer = function (height) {
        sys.ws._messageSource.postMessage('HEIGHT_ACTION=' + height, sys.ws._messageOrigin);
    };

    ///////////////////////////////////////////////////////////////////////////////////////////////
    // END OF GENERIC LIBRARY TO HELP ACCESSING WEB SERVICES
    ///////////////////////////////////////////////////////////////////////////////////////////////

    ///////////////////////////////////////////////////////////////////////////////////////////////
    // GENERIC LIBRARY TO HELP ACCESSING QUERY PARAMETERS
    ///////////////////////////////////////////////////////////////////////////////////////////////

    sys.context.PARAMS = urlParamsToObject();

    // Generic WS methods

    sys.context.getParam = function (name) {
        return sys.context.PARAMS[name];
    };

    ///////////////////////////////////////////////////////////////////////////////////////////////
    // END OF GENERIC LIBRARY TO HELP ACCESSING QUERY PARAMETERS
    ///////////////////////////////////////////////////////////////////////////////////////////////

} else {
    console.warn("UI API won't be available because jQuery is not loaded");
}
