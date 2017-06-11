var currentStep = 0;
var MAX_STEP_NUM = 4;

var worker = null;

var barEl = document.getElementById("myBar");

var image_set = { base: "360.jpg" };

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


var ratio = 1;

// Camera parameters
var dstWidth = 600;
var dstHeight = 500;
var hfov = 80; //  in degrees
var gYaw = 0,
    gPitch = 0,
    gRoll = 0;

window.onload = function() {
    orig_img = new Image;
    orig_img.onload = function() {
        var parentWidth = $("#main").width();
        ratio = parentWidth / orig_img.width;

        resized_canvas.width = parentWidth;
        resized_canvas.height = orig_img.height * ratio;

        // draw original image (not show)
        orig_canvas.width = orig_img.width;
        orig_canvas.height = orig_img.height;

        // drawImageAntialiasing(orig_img, orig_img.width, orig_img.height, orig_ctx);
        orig_ctx.drawImage(orig_img, 0, 0, orig_img.width, orig_img.height);

        // draw resized image
        // drawImageAntialiasing(orig_img, orig_img.width * ratio, orig_img.height * ratio, resized_ctx);
        resized_ctx.drawImage(orig_canvas, 0, 0, orig_img.width * ratio, orig_img.height * ratio);

    }
    base_canvas.width = dstWidth;
    base_canvas.height = dstHeight;
    orig_img.src = image_set.base;

    worker = new Worker("equiprocess.js");

    worker.addEventListener("message", function(event) {
        if (event.data.direction == "forward" && event.data.finished) {
            base_ctx.putImageData(event.data.dstData, 0, 0);
        } else if (event.data.direction == "backward" && event.data.finished) {
            // back to equirectangular
            console.log(event.data);
            result_resized_canvas.width = resized_canvas.width;
            result_resized_canvas.height = resized_canvas.height;
            // result_resized_ctx.drawImage(event.data.resultData, 0, 0, result_resized_canvas.width, result_resized_canvas.height);

            var newCanvas = $("<canvas>")
                .attr("width", event.data.resultData.width)
                .attr("height", event.data.resultData.height)[0];
            newCanvas.getContext("2d").putImageData(event.data.resultData, 0, 0);

            // result_resized_ctx.scale(1/ratio, 1/ratio);
            result_resized_ctx.drawImage(newCanvas, 0, 0, result_resized_canvas.width, result_resized_canvas.height);
            document.body.appendChild(newCanvas);
            // result_resized_ctx.putImageData(result_ctx.getImageData(0, 0, result_canvas.width, result_canvas.height), 0, 0);
        } else {
            // processing
            move();
        }

    });
};

function update() {
    var params = {
        direction: "forward",
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

function backTo360() {
    worker.postMessage({
        direction: "backward",
        mixedData: base_ctx.getImageData(0, 0, base_size.width, base_size.height),
        resultData: result_ctx.getImageData(0, 0, result_canvas.width, result_canvas.height),
        srcWidth: result_canvas.width,
        srcHeight: result_canvas.width,
        dstWidth: base_canvas.width,
        dstHeight: base_canvas.height,
        hfov: hfov, //  in degrees
        gYaw: gYaw,
        gPitch: gPitch,
        gRoll: gRoll
    });
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

function move(val) {
    if (val) {
        progress = val;
        barEl.style.width = progress / 2 + '%';
    } else {
        progress++;
        barEl.style.width = progress / 2 + '%';
    }
}

function mymouseclick(event) {
    var a = equiToLatlon(event.layerX / ratio, event.layerY / ratio, orig_img.width, orig_img.height);
    setDirection(a.lon, a.lat, 0);
    move(1);
    update();
}
