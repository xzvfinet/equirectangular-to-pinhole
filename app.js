var currentStep = 0;
var MAX_STEP_NUM = 3;

var worker = null;
var image_set = { base: "360-compressed.jpg" };

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

// buttons
var nextBtn = document.getElementById('next-btn');
var prevBtn = document.getElementById('prev-btn');
var nextBtnAbility = [true, true, false];
var prevBtnAbility = [false, true, true];

var segmentNum = -1;
// var segmentNum = 36;
var corners = [];
var unitPoint = {};
var ratio = 1;

// Camera parameters
var dstWidth = Number(document.getElementsByName('input-width')[0].value);
var dstHeight = Number(document.getElementsByName('input-height')[0].value);
var newWidth;
var newHeight;
var fov = Number(document.getElementsByName('input-fov')[0].value); //  in degrees
var option = 'width';
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

        // draw original image (hidden)
        orig_canvas.width = orig_img.width;
        orig_canvas.height = orig_img.height;
        orig_ctx.drawImage(orig_img, 0, 0, orig_img.width, orig_img.height);

        // draw resized image
        resized_ctx.imageSmoothingQuality = "high";
        resized_ctx.drawImage(orig_canvas, 0, 0, resized_canvas.width, resized_canvas.height);

    }
    orig_img.load(image_set.base);
    resized_canvas.width = viewWidth;
    resized_canvas.height = viewWidth / 2;

    base_canvas.width = dstWidth;
    base_canvas.height = dstHeight;

    worker = new Worker("equiprocess.js");
    worker.addEventListener("message", onmessage);

    // Set center as initial position
    var a = equiToLatlon(orig_img.width / 2, orig_img.height / 2, orig_img.width, orig_img.height);
    setDirection(a.lon, a.lat, 0);
};

function updateBase() {
    var params = {
        direction: "forward",
        interpolation: "bilinear",
        srcData: orig_ctx.getImageData(0, 0, orig_canvas.width, orig_canvas.height),
        dstData: base_ctx.createImageData(base_canvas.width, base_canvas.height),
        srcWidth: orig_img.width,
        srcHeight: orig_img.height,
        dstWidth: base_canvas.width,
        dstHeight: base_canvas.height,
        fov: fov, //  in degrees
        option: option,
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
        fov: fov, //  in degrees
        option: option,
        gYaw: gYaw,
        gPitch: gPitch,
        gRoll: gRoll
    });
}

function updateFrame() {
    resized_ctx.drawImage(orig_canvas, 0, 0, orig_img.width * ratio, orig_img.height * ratio);
    move(1);

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
        fov: fov, //  in degrees
        option: option,
        gYaw: gYaw,
        gPitch: gPitch,
        gRoll: gRoll
    });
}

function getLatlonPoint(x, y) {
    var a = equiToLatlon(x / ratio, y / ratio, orig_img.width, orig_img.height);
    console.log(a);
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

                result_resized_ctx.imageSmoothingQuality = 'high';
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
        barEl.style.width = 100 * (progress / dstHeight) + '%';
    } else {
        progress++;
        barEl.style.width = 100 * (progress / dstHeight) + '%';
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

    nextBtn.disabled = !nextBtnAbility[currentStep];
    prevBtn.disabled = !prevBtnAbility[currentStep];
}

function prevStep() {
    if (currentStep == 0)
        return;

    steps[currentStep].hidden = true;
    steps[--currentStep].hidden = false;

    nextBtn.disabled = !nextBtnAbility[currentStep];
    prevBtn.disabled = !prevBtnAbility[currentStep];
}

function mymouseclick(event) {
    nextBtn.disabled = false;
    updateByPostion(event.layerX, event.layerY);
}

window.clickScreen = function(pos) {
    var center = { layerX: resized_canvas.width / 2, layerY: resized_canvas.height / 2 };
    var bottom = { layerX: resized_canvas.width / 2, layerY: resized_canvas.height };
    var top = { layerX: resized_canvas.width / 2, layerY: 0 };
    var left = { layerX: 0, layerY: resized_canvas.height / 2 };
    var right = { layerX: resized_canvas.width, layerY: resized_canvas.height / 2 };

    mymouseclick(eval(pos));
}

function updateByPostion(x, y) {
    var a = equiToLatlon(x / ratio, y / ratio, orig_img.width, orig_img.height);
    setDirection(a.lon, a.lat, 0);

    updateFrame();
}

window.updateByParameter = function(params) {
    fov = Number(params['fov']);
    dstWidth = Number(params['width']);
    dstHeight = Number(params['height']);
    option = params['option'];

    base_canvas.width = dstWidth;
    base_canvas.height = dstHeight;

    updateFrame();
}

function dataURLtoBlob(dataurl) {
    var arr = dataurl.split(','),
        mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]),
        n = bstr.length,
        u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
}

function downloadCanvas() {
    var canvas;
    if (this.id == "dl-orig") canvas = resized_canvas;
    else if (this.id == "dl-base") canvas = base_canvas;
    else if (this.id == "dl-result") canvas = result_resized_canvas;
    else return;

    var link = document.createElement("a");
    var imgData = canvas.toDataURL({
        format: 'png',
        multiplier: 4
    });
    var blob = dataURLtoBlob(imgData);
    var objurl = URL.createObjectURL(blob);

    link.download = this.id;
    link.href = objurl;
    link.click();
}

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