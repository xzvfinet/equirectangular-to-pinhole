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

    var size = 4 * param.dstWidth * param.dstHeight;
    var dstData = param.dstData;
    var srcData = param.srcData;

    var pixMap = [];
    var index = 0;

    for (var row = 0; row < param.dstHeight; ++row) {
        for (var col = 0; col < param.dstWidth; ++col) {
            var equi = pinholeToEqui(col, row);

            var srcPixel = getPixelInterpolation(param.srcData.data, param.srcWidth, equi.x, equi.y);
            var dstInd = (row * param.dstWidth + col) * 4;

            dstData.data[dstInd + 0] = srcPixel[0];
            dstData.data[dstInd + 1] = srcPixel[1];
            dstData.data[dstInd + 2] = srcPixel[2];
            dstData.data[dstInd + 3] = srcPixel[3];
        }

        // add up progress
        self.postMessage({ direction: "forward", counter: ++counter });
    }

    return dstData;
}

function backwardProjection(param) {
    // for work progress counting
    var counter = 0;

    var mixedData = param.mixedData;
    var resultData = param.resultData;

    var index = 0;
    for (var row = 0; row < resultData.height; ++row) {
        for (var col = 0; col < resultData.width; ++col) {

            var pinhole = equiToPinhole(col, row);
            if (pinhole.x < 0 || pinhole.x > mixedData.width) continue;
            if (pinhole.y < 0 || pinhole.y > mixedData.height) continue;

            var pixel = getPixelInterpolation(mixedData.data, mixedData.width, pinhole.x, pinhole.y);

            var ind_mixed = (pinhole.y * mixedData.width + pinhole.x) * 4;
            var ind_orig = (row * resultData.width + col) * 4;
            resultData.data[ind_orig + 0] = pixel[0];
            resultData.data[ind_orig + 1] = pixel[1];
            resultData.data[ind_orig + 2] = pixel[2];
            resultData.data[ind_orig + 3] = pixel[3];
        }

        self.postMessage({ direction: "backward", counter: ++counter });
    }

    return resultData;
}

function getPixelInterpolation(data, width, x, y) {
    const args = [data, width, x, y];
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
    // not implemented
}

function pinholeToEqui(x, y) {
    var spherePoint = pinholeToSphere(x, y);
    var equiPoint = sphereToEqui(spherePoint.x, spherePoint.y, spherePoint.z);
    return equiPoint;
}

function pinholeToSphere(x, y) {
    var pinhole = { x: x, y: y };
    var normalized = normalizeCameraParameters(pinhole.x, pinhole.y);
    var rotated = multiplyRotation(normalized.x, normalized.y, normalized.z);

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
    return {
        lon: Math.atan2(y, x),
        lat: Math.atan2(-z, r)
    }
}

// lon: -PI ~ +PI
// lat: -PI/2 ~ +PI/2
function latlonToEqui(lat, lon) {
    var x = wrapZeroToOne(lon / (Math.PI * 2) + 0.5) * param.srcWidth;
    var y = (lat / Math.PI + 0.5) * (param.srcHeight - 1);
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

function equiToSphere(x, y) {
    var equi = { x: x, y: y };
    var latlon = equiToLatlon(equi.x, equi.y);
    var sphere = latlonToNorm(latlon.lat, latlon.lon);
    return sphere;
}

function sphereToPinhole(x, y, z) {
    var rotated = { x: x, y: y, z: z };
    var normalized = divideRotation(rotated.x, rotated.y, rotated.z);
    var pinhole = applyCameraParameters(normalized.x, normalized.y);
    return pinhole;
}

function equiToLatlon(x, y) {
    var lon = (x / param.srcWidth - 0.5) * Math.PI * 2;
    var lat = ((param.srcHeight - y - 1.0) / (param.srcHeight - 1) - 0.5) * Math.PI;
    return {
        lon: lon,
        lat: lat
    };
}

/*
ax = a*x
ay = a*y
az = a*z
ar = a*r
(a: scaling constant)
*/
function latlonToNorm(lat, lon) {
    var ax = Math.cos(lon);
    var ay = Math.sin(lon);
    var ar = Math.sqrt(ax * ax + ay * ay);
    var az = -Math.tan(lat) * ar;
    var a = Math.sqrt(ax * ax + ay * ay + az * az);

    var x = ax / a;
    var y = ay / a;
    var z = az / a;

    return { x: x, y: y, z: z };
}



function normalizeCameraParameters(x, y) {
    var newx = a11 * x + a12 * y + a13;
    var newy = a22 * y + a23;
    var newz = 1;
    var s = Math.sqrt(newx * newx + newy * newy + newz * newz);
    return {
        x: newx / s,
        y: newy / s,
        z: newz / s
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
function multiplyRotation(x, y, z) {
    var X = (-sinYaw) * x + (cosYaw * sinPitch) * y + (cosYaw * cosPitch) * z;
    var Y = (cosRoll * cosYaw) * x + (cosRoll * sinYaw * sinPitch - sinRoll * cosPitch) * y + (cosRoll * sinYaw * cosPitch + sinRoll * sinPitch) * z;
    var Z = (sinRoll * cosYaw) * x + (sinRoll * sinYaw * sinPitch + cosRoll * cosPitch) * y + (sinRoll * sinYaw * cosPitch - cosRoll * sinPitch) * z;

    return {
        x: X,
        y: Y,
        z: Z
    };
}

/*
Refer to matrix.txt
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

function wrapZeroToOne(value) {
    if (value >= 0) {
        return value % 1.0;
    } else {
        return (1.0 + (value % 1.0)) % 1.0;
    }
}