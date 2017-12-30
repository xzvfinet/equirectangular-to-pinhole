// Parameters
var param = {};
// Desired rotation
var cosRoll, sinRoll, cosPitch, sinPitch, cosYaw, sinYaw;

self.addEventListener("message", function(event) {

    param = event.data;

    calculateIntrinsic(param.dstWidth, param.dstHeight, param.fov, 0);

    var result = {};

    if (param.direction == "unit") {
        var points = param.points;
        var equiPoints = [];

        for (var i in points) {
            equiPoints.push(pinholeToEqui(points[i].x, points[i].y));
        }

        result.equiPoints = equiPoints;
    } else {
        result.data = eval(param.direction + 'Projection')(param);
    }

    self.postMessage({ direction: param.direction, finished: true, result: result });
});

function forwardProjection(param) {
    if (!param || !param.srcData) {
        console.log('no data for worker');
        return;
    }

    // for work progress bar
    var counter = 0;
    var length = param.dstHeight / 100;
    var adder = length;

    var size = 4 * param.dstWidth * param.dstHeight;
    var dstData = param.dstData;
    var srcData = param.srcData;

    var pixMap = [];
    var index = 0;

    for (var row = 0; row < param.dstHeight; ++row) {
        for (var col = 0; col < param.dstWidth; ++col) {
            var equi = pinholeToEqui(col, row);

            var srcPixel = getSrcPixelInterpolation(param, equi.x, equi.y);
            var dstInd = (row * param.dstWidth + col) * 4;

            dstData.data[dstInd + 0] = srcPixel[0];
            dstData.data[dstInd + 1] = srcPixel[1];
            dstData.data[dstInd + 2] = srcPixel[2];
            dstData.data[dstInd + 3] = srcPixel[3];
        }

        // add up progress
        length += adder;
        self.postMessage({ counter: ++counter });
    }

    return dstData;
}

function backwardProjection(param) {
    // for work progress counting
    var counter = 0;
    var length = param.dstHeight / 100;
    var adder = length;

    var mixedData = param.mixedData;
    var resultData = param.resultData;

    var index = 0;
    for (var row = 0; row < mixedData.height; ++row) {
        for (var col = 0; col < mixedData.width; ++col) {
            if (row >= length) {
                length += adder;
                self.postMessage({ counter: ++counter });
            }

            var equi = pinholeToEqui(col, row);
            equi.x = Math.round(equi.x);
            equi.y = Math.round(equi.y);

            var ind_mixed = (row * mixedData.width + col) * 4;
            var ind_orig = (equi.y * resultData.width + equi.x) * 4;
            resultData.data[ind_orig + 0] = mixedData.data[ind_mixed + 0];
            resultData.data[ind_orig + 1] = mixedData.data[ind_mixed + 1];
            resultData.data[ind_orig + 2] = mixedData.data[ind_mixed + 2];
            resultData.data[ind_orig + 3] = mixedData.data[ind_mixed + 3];
        }
    }

    return resultData;
}

function getSrcPixelInterpolation(param, x, y) {
    const args = [param.srcData.data, param.srcWidth, x, y];
    var result;
    if (param.interpolation == 'nearest') {
        result = nearest(...args);
    } else if (param.interpolation == 'bilinear') {
        result = bilinear(...args);
    } else if (param.interpolation == 'bicubic') {
        result = bicubic(...args);
    }

    return result;
}

function nearest(data, width, x, y) {
    x = Math.round(x);
    y = Math.round(y);
    var srcInd = (y * width + x) * 4;
    return [
        data[srcInd + 0],
        data[srcInd + 1],
        data[srcInd + 2],
        data[srcInd + 3]
    ];
}

function bilinear(data, width, x, y) {
    var x1 = Math.floor(x);
    var x2 = Math.ceil(x);
    var y1 = Math.floor(y);
    var y2 = Math.ceil(y);

    var a = (x - x1) / (x2 - x1);
    var b = (x2 - x) / (x2 - x1);
    if (x2 == x1) {
        a = 0.5;
        b = 0.5;
    }

    var c = (y - y1) / (y2 - y1);
    var d = (y2 - y) / (y2 - y1);
    if (y2 == y1) {
        c = 0.5;
        d = 0.5;
    }

    var ind11 = (y1 * width + x1) * 4;
    var ind12 = (y1 * width + x2) * 4;
    var ind21 = (y2 * width + x1) * 4;
    var ind22 = (y2 * width + x2) * 4;

    var f1 = [
        b * data[ind11 + 0] + a * data[ind12 + 0],
        b * data[ind11 + 1] + a * data[ind12 + 1],
        b * data[ind11 + 2] + a * data[ind12 + 2],
        b * data[ind11 + 3] + a * data[ind12 + 3]
    ];

    var f2 = [
        b * data[ind21 + 0] + a * data[ind22 + 0],
        b * data[ind21 + 1] + a * data[ind22 + 1],
        b * data[ind21 + 2] + a * data[ind22 + 2],
        b * data[ind21 + 3] + a * data[ind22 + 3]
    ];

    return [
        f1[0] * d + f2[0] * c,
        f1[1] * d + f2[1] * c,
        f1[2] * d + f2[2] * c,
        f1[3] * d + f2[3] * c
    ];
}

function bicubic(data, width, x, y) {

}

function pinholeToEqui(x, y) {
    var spherePoint = pinholeToSphere(x, y);
    var equiPoint = sphereToEqui(spherePoint.x, spherePoint.y, spherePoint.z);
    // console.log(Math.sqrt(Math.pow(spherePoint.x, 2) + Math.pow(spherePoint.y, 2) + Math.pow(spherePoint.z, 2)));
    return equiPoint;
}

function pinholeToSphere(x, y) {
    var pinhole = { x: x, y: y };
    var normalized = normalizeCameraParameters(pinhole.x, pinhole.y);
    // console.log(normalized.x, normalized.y, Math.sqrt(5 - (Math.pow(normalized.x, 2) + Math.pow(normalized.y, 2))));
    // var rotated = multiplyRotation(normalized.x, normalized.y, Math.sqrt(3 - (Math.pow(normalized.x, 2) + Math.pow(normalized.y, 2))));
    var rotated = multiplyRotation(normalized.x, normalized.y, normalized.z);

    // normalize distance (radius=1)
    var s = Math.sqrt(Math.pow(rotated.x, 2) + Math.pow(rotated.y, 2) + Math.pow(rotated.z, 2));
    // rotated.x /= s;
    // rotated.y /= s;
    // rotated.z /= s;

    return rotated;
}

function sphereToEqui(x, y, z) {
    var sphere = { x: x, y: y, z: z };
    var latlon = normToLatlon(sphere.x, sphere.y, sphere.z);
    var equi = latlonToEqui(latlon.lat, latlon.lon);
    return equi;
}

function normToLatlon(x, y, z) {
    var r = Math.sqrt(x * x + y * y);
    // console.log('r1: ' + r);
    // console.log('r2: ' + (x * x + y * y + z * z));
    return {
        lon: Math.atan2(y, x),
        lat: safeAtan(-z, r)
    }
}

function latlonToEqui(lat, lon) {
    var x = wrapZeroToOne(lon / (Math.PI * 2) + 0.5) * param.srcWidth;
    var y = reflectZeroToOne(lat / Math.PI + 0.5) * (param.srcHeight - 1);
    y = param.srcHeight - y - 1;
    return {
        x: x,
        y: y
    }
}

function equiToPinhole(x, y) {
    // equi to lat lon
    var spherePoint = equiToSphere(x, y);
    var pinholePoint = sphereToPinhole(spherePoint.x, spherePoint.y, spherePoint.z);
    return pinholePoint;
}

function sphereToPinhole(x, y, z) {
    var rotated = { x: x, y: y, z: z };
    var normalized = divideRotation(rotated.x, rotated.y, rotated.z);
    var pinhole = applyCameraParameters(normalized.x, normalized.y);
    return pinhole;
}

function equiToSphere(x, y) {
    var equi = { x: x, y: y };
    var latlon = equiToLatlon(equi.x, equi.y);
    var sphere = latlonToNorm(latlon.lat, latlon.lon);
    return sphere;
}

function latlonToNorm(lat, lon) {

}

function equiToLatlon(x, y) {
    var lon = (x / param.srcWidth - 0.5) * Math.PI * 2;
    var lat = ((param.srcHeight - y - 1.0) / (param.srcHeight - 1) - 0.5) * Math.PI;
    return {
        lon: lon,
        lat: lat
    };
}

function normalizeCameraParameters(x, y) {
    var newx = a11 * x + a12 * y + a13;
    var newy = a22 * y + a23;
    var newz = f / (1 - f);
    return {
        x: newx,
        y: newy,
        z: 1
    };
}

function applyCameraParameters(x, y) {
    var newy = (y - a23) / a22;
    var newx = ((x - a13) - newy * a12) / a11;
    return {
        x: newx,
        y: newy
    }
}

/*
Refer to matrix.txt
*/
// default yaw=0, pitch=0, roll=0
function multiplyRotation(x, y, z) {
    // Rx(roll) * Rz(yaw) * Ry(pitch)

    // X(pi/2), Y(pi/2)
    var X = (-sinYaw) * x + (cosYaw * sinPitch) * y + (cosYaw * cosPitch) * z;
    var Y = (cosRoll * cosYaw) * x + (cosRoll * sinYaw * sinPitch - sinRoll * cosPitch) * y + (cosRoll * sinYaw * cosPitch + sinRoll * sinPitch) * z;
    var Z = (sinRoll * cosYaw) * x + (sinRoll * sinYaw * sinPitch + cosRoll * cosPitch) * y + (sinRoll * sinYaw * cosPitch - cosRoll * sinPitch) * z;

    // X(pi/2)
    // var X = (cosYaw * cosPitch) * x + (cosYaw * sinPitch) * y - (-sinYaw) * z;
    // var Y = (cosRoll * sinYaw * cosPitch + sinRoll * sinPitch) * x + (cosRoll * sinYaw * sinPitch - sinRoll * cosPitch) * y - (cosRoll * cosYaw) * z;
    // var Z = (sinRoll * sinYaw * cosPitch - cosRoll * sinPitch) * x + (sinRoll * sinYaw * sinPitch + cosRoll * cosPitch) * y - (sinRoll * cosYaw) * z;

    // no rotation
    // var X = (cosYaw * cosPitch) * x + (-sinYaw) * y + (cosYaw * sinPitch) * z;
    // var Y = (cosRoll * sinYaw * cosPitch + sinRoll * sinPitch) * x + (cosRoll * cosYaw) * y + (cosRoll * sinYaw * sinPitch - sinRoll * cosPitch) * z;
    // var Z = (sinRoll * sinYaw * cosPitch - cosRoll * sinPitch) * x + (sinRoll * cosYaw) * y + (sinRoll * sinYaw * sinPitch + cosRoll * cosPitch) * z;

    return {
        x: X,
        y: Y,
        z: Z
    };
}

/*
inversion matrix of 3d rotation matrix

|a b c| = |-d  cf       ce    |
|d e f| = |ac  adf-be   ade+bf|
|g h i| = |bc  bdf+ae   bde-af|

|a b c|-1              1            |ei-fh ch-bi bf-ce|
|d e f|   = ----------------------- |fg-di ai-cg cd-af|
|g h i|     aei-afh-bdi+bfg+cdh-ceg |dh-eg bg-ah ae-bd|
*/
function divideRotation(x, y, z) {
    var a = -sinYaw,
        b = cosYaw * sinPitch,
        c = cosYaw * cosPitch,
        d = cosRoll * cosYaw,
        e = cosRoll * sinYaw * sinPitch - sinRoll * cosPitch,
        f = cosRoll * sinYaw * cosPitch + sinRoll * sinPitch,
        g = sinRoll * cosYaw,
        h = sinRoll * sinYaw * sinPitch + cosRoll * cosPitch,
        i = sinRoll * sinYaw * cosPitch - cosRoll * sinPitch;

    var det = a * e * i - a * f * h - b * d * i + b * f * g + c * d * h - c * e * g;
    var iDet = 1 / det;

    var m = [
        [e * i - f * h, c * h - b * i, b * f - c * e],
        [f * g - d * i, a * i - c * g, c * d - a * f],
        [d * h - e * g, b * g - a * h, a * e - b * d]
    ];

    var X, Y, Z;
    Z = (m[2][0] * x + m[2][1] * y + m[2][2] * z) * iDet;
    X = (m[0][0] * x + m[0][1] * y + m[0][2] * z) / Z * iDet;
    Y = (m[1][0] * x + m[1][1] * y + m[1][2] * z) / Z * iDet;

    return {
        x: X,
        y: Y
    };
}

// Commonly there are two parameters, intrinsic and extrinsic
// But we can assume that extrinsic is the identity matrix
var a11, a12, a13, a22, a23;
/*
f: focal length
fov: horizontal field of view
cx: center x positoin
cy: center y position
*/
var f;

function calculateIntrinsic(pinholeWidth, pinholeHeight, fov, skew) {
    var length = (param['option'] == 'width') ? pinholeWidth : pinholeHeight;
    f = (length / 2.0) / Math.tan(toRadian(fov) / 2.0);

    // console.log(f);
    var fx = f;
    var fy = f;
    var cx = pinholeWidth / 2;
    var cy = pinholeHeight / 2;
    a11 = (1.0 / fx);
    a12 = (-skew / (fx * fy));
    a13 = ((skew * cy - cx * fy) / (fx * fy));
    a22 = (1.0 / fy);
    a23 = (-cy / fy);

    cosRoll = Math.cos(param.gRoll);
    sinRoll = Math.sin(param.gRoll);
    cosPitch = Math.cos(param.gPitch);
    sinPitch = Math.sin(param.gPitch);
    cosYaw = Math.cos(param.gYaw);
    sinYaw = Math.sin(param.gYaw);
}

function toRadian(val) {
    return val * Math.PI / 180;
}

function safeAtan(y, x) {
    if (x == 0.0) {
        if (y >= 0.0)
            return Math.PI / 2;
        else
            return -Math.PI / 2;
    }
    return Math.atan(y / x);
}

function wrapZeroToOne(value) {
    if (value >= 0)
        return value % 1.0;
    else {
        return (1.0 + (value % 1.0)) % 1.0;
    }
}

function reflectZeroToOne(value) {
    if (value < 0)
        value = -value;
    value = value % 2.0;
    if (value > 1.0)
        return 2.0 - value;
    return value;
}