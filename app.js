var currentStep = 0;
var MAX_STEP_NUM = 3;

var worker = null;
var image_set = { base: "360.png" };

// Div
var steps = [
    document.getElementById("step1"),
    document.getElementById("step2"),
    document.getElementById("step3")
];

// extracted canvas
orig_canvas = document.getElementById("original-360");
orig_ctx = orig_canvas.getContext('2d');
resized_canvas = document.getElementById("canvas-360");
resized_ctx = resized_canvas.getContext("2d");
base_canvas = document.getElementById("base-canvas");
base_ctx = base_canvas.getContext("2d");

// reverted canvas
result_canvas = document.getElementById("result-canvas");
result_ctx = result_canvas.getContext("2d");
result_resized_canvas = document.getElementById("result-resized-canvas");
result_resized_ctx = result_resized_canvas.getContext("2d");

var segmentNum = -1;
// var segmentNum = 36;
var corners = [];
var unitPoint = {};
var ratio = 1;

// Camera parameters
var dstWidth = 600;
var dstHeight = 500;
var hfov = 80; //  in degrees
var gYaw = 0,
    gPitch = 0,
    gRoll = 0;

// Width of view canvas
var viewWidth = 1024;

window.onload = function() {
    steps[1].hidden = true;
    steps[2].hidden = true;

    orig_img = new Image;
    orig_img.onload = function() {
        ratio = viewWidth / orig_img.width;

        resized_canvas.width = viewWidth;
        resized_canvas.height = orig_img.height * ratio;

        // draw original image (not show)
        orig_canvas.width = orig_img.width;
        orig_canvas.height = orig_img.height;

        drawImageAntialiasing(orig_img, orig_img.width, orig_img.height, orig_ctx);
        // orig_ctx.drawImage(orig_img, 0, 0, orig_img.width, orig_img.height);

        // draw resized image
        // drawImageAntialiasing(orig_img, orig_img.width * ratio, orig_img.height * ratio, resized_ctx);
        resized_ctx.drawImage(orig_canvas, 0, 0, orig_img.width * ratio, orig_img.height * ratio);

    }
    orig_img.load(image_set.base);
    resized_canvas.width = viewWidth;
    resized_canvas.height = viewWidth/2;

    base_canvas.width = dstWidth;
    base_canvas.height = dstHeight;

    worker = new Worker("equiprocess.js");
    worker.addEventListener("message", onmessage);
};

function updateBase() {
    var params = {
        direction: "forward",
        interpolation: "",
        srcData: orig_ctx.getImageData(0, 0, orig_canvas.width, orig_canvas.height),
        dstData: base_ctx.createImageData(base_canvas.width, base_canvas.height),
        srcWidth: orig_img.width,
        srcHeight: orig_img.height,
        dstWidth: base_canvas.width,
        dstHeight: base_canvas.height,
        hfov: hfov, //  in degrees
        gYaw: gYaw,
        gPitch: gPitch,
        gRoll: gRoll
    };
    worker.postMessage(params);
}

function update360() {
    worker.postMessage({
        direction: "backward",
        interpolation: "",
        mixedData: base_ctx.getImageData(0, 0, base_canvas.width, base_canvas.height),
        resultData: result_ctx.getImageData(0, 0, resized_canvas.width, resized_canvas.height),
        srcWidth: resized_canvas.width,
        srcHeight: resized_canvas.height,
        dstWidth: base_canvas.width,
        dstHeight: base_canvas.height,
        hfov: hfov, //  in degrees
        gYaw: gYaw,
        gPitch: gPitch,
        gRoll: gRoll
    });
}

function updateFrame() {
    resized_ctx.drawImage(orig_canvas, 0, 0, orig_img.width * ratio, orig_img.height * ratio);

    var points = [];

    points = points.concat(getLinePoints(0, 0, dstWidth, 0, segmentNum));
    points = points.concat(getLinePoints(dstWidth, 0, dstWidth, dstHeight, segmentNum));
    points = points.concat(getLinePoints(dstWidth, dstHeight, 0, dstHeight, segmentNum));
    points = points.concat(getLinePoints(0, dstHeight, 0, 0, segmentNum));

    worker.postMessage({
        direction: "unit",
        points: points,
        srcWidth: orig_img.width,
        srcHeight: orig_img.height,
        dstWidth: base_canvas.width,
        dstHeight: base_canvas.height,
        hfov: hfov, //  in degrees
        gYaw: gYaw,
        gPitch: gPitch,
        gRoll: gRoll
    });
}

function onmessage(event) {
    var result = event.data.result;
    if (event.data.finished) {
        switch (event.data.direction) {
            case "forward":
                base_ctx.putImageData(result.data, 0, 0);

                break;
            case "backward":
                // back to equirectangular
                result_resized_canvas.width = resized_canvas.width;
                result_resized_canvas.height = resized_canvas.height;

                result_resized_ctx.putImageData(result.data, 0, 0);

                break;
            case "unit":
                corners = result.equiPoints;

                resized_ctx.lineWidth = 7;
                resized_ctx.strokeStyle = '#ff0000';

                resized_ctx.beginPath();
                resized_ctx.moveTo(corners[0].x * ratio, corners[0].y * ratio);
                for (var i = 0; i < corners.length; ++i) {
                    var j = (i + 1);
                    if (j >= corners.length) break;

                    var dist = Math.sqrt(Math.pow(corners[i].x - corners[j].x, 2) + Math.pow(corners[i].y - corners[j].y, 2));
                    if (dist < orig_canvas.width / 2) {
                        resized_ctx.lineTo(corners[j].x * ratio, corners[j].y * ratio);
                    } else {
                        resized_ctx.stroke();
                        resized_ctx.beginPath();
                        resized_ctx.moveTo(corners[j].x * ratio, corners[j].y * ratio);
                    }
                }
                resized_ctx.stroke();
                break;
        }
    } else {
        // processing
        move();
    }

}

function getLinePoints(x0, y0, x1, y1, segments) {
    var linePoints = [];

    var d = 1;
    if (segments == -1) {
        d = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    } else {
        d = segments;
    }

    var dx = (x1 - x0) / d;
    var dy = (y1 - y0) / d;

    for (var i = 0; i < d; ++i) {
        var x = x0 + dx * i;
        var y = y0 + dy * i;

        linePoints.push({ x: x, y: y });
    }
    return linePoints;
}

function drawImageAntialiasing(img, width, height, dstCtx) {
    var off_canvas = document.createElement('canvas'),
        off_ctx = off_canvas.getContext('2d');

    off_canvas.width = img.width * 0.5;
    off_canvas.height = img.height * 0.5;

    off_ctx.drawImage(img, 0, 0, off_canvas.width, off_canvas.height);
    off_ctx.drawImage(off_canvas, 0, 0, off_canvas.width * 0.5, off_canvas.height * 0.5);

    dstCtx.drawImage(off_canvas, 0, 0, off_canvas.width * 0.5, off_canvas.height * 0.5, 0, 0, width, height);
}

function equiToLatlon(x, y, width, height) {
    var lon = (x / width - 0.5) * Math.PI * 2;
    var lat = ((height - y - 1.0) / (height - 1) - 0.5) * Math.PI;
    return {
        lon: lon,
        lat: lat
    }
}

function setDirection(yaw, pitch, roll) {
    gYaw = yaw;
    gPitch = pitch;
    gRoll = roll;
}

var progress = 1;

var barEl = document.getElementById("myBar");

function move(val) {
    if (val) {
        progress = val;
        barEl.style.width = progress / 2 + '%';
    } else {
        progress++;
        barEl.style.width = progress / 2 + '%';
    }
}

function nextStep() {
    if (currentStep == MAX_STEP_NUM - 1)
        return;

    switch (currentStep) {
        case 0:
            updateBase();
            break;
        case 1:
            update360();
            break;
    }

    steps[currentStep].hidden = true;
    steps[++currentStep].hidden = false;

}

function prevStep() {
    if (currentStep == 0)
        return;

    steps[currentStep].hidden = true;
    steps[--currentStep].hidden = false;
}

function mymouseclick(event) {
    updateByPostion(event.layerX, event.layerY);
}

function updateByPostion(x, y) {
    var a = equiToLatlon(x / ratio, y / ratio, orig_img.width, orig_img.height);
    setDirection(a.lon, a.lat, 0);

    move(1);
    clearCanvas();
    updateFrame();
}

window.updateByParameter = function(fov, width, height) {
    hfov = Number(fov);
    dstWidth = Number(width);
    dstHeight = Number(height);

    base_canvas.width = dstWidth;
    base_canvas.height = dstHeight;

    move(1);
    clearCanvas();
    updateFrame();
}

function clearCanvas() {
    base_ctx.clearRect(0, 0, base_canvas.width, base_canvas.height);
    resized_ctx.clearRect(0, 0, resized_canvas.width, resized_canvas.height);
}

function downloadCanvas() {
    var canvas;
    if (this.id == "dl-orig") canvas = resized_canvas;
    else if (this.id == "dl-base") canvas = base_canvas;
    else if (this.id == "dl-result") canvas = result_resized_canvas;
    else return;

    var dt = canvas.toDataURL('image/png');
    /* Change MIME type to trick the browser to downlaod the file instead of displaying it */
    dt = dt.replace(/^data:image\/[^;]*/, 'data:application/octet-stream');

    /* In addition to <a>'s "download" attribute, you can define HTTP-style headers */
    dt = dt.replace(/^data:application\/octet-stream/, 'data:application/octet-stream;headers=Content-Disposition%3A%20attachment%3B%20filename=Canvas.png');

    this.href = dt;
};
document.getElementById("dl-orig").addEventListener('click', downloadCanvas, false);
document.getElementById("dl-base").addEventListener('click', downloadCanvas, false);
document.getElementById("dl-result").addEventListener('click', downloadCanvas, false);

Image.prototype.load = function(url) {
    var thisImg = this;
    var xmlHTTP = new XMLHttpRequest();
    xmlHTTP.open('GET', url, true);
    xmlHTTP.responseType = 'arraybuffer';
    xmlHTTP.onload = function(e) {
        var blob = new Blob([this.response]);
        thisImg.src = window.URL.createObjectURL(blob);
    };
    xmlHTTP.onprogress = function(e) {
        thisImg.completedPercentage = parseInt((e.loaded / e.total) * 100);
        $("#load-progress").attr("value", thisImg.completedPercentage);
    };
    xmlHTTP.onloadstart = function() {
        thisImg.completedPercentage = 0;
    };
    xmlHTTP.send();
};
Image.prototype.completedPercentage = 0;