// Camera parameters
var param = {};
var f;
var cx;
var cy;
var fx;
var fy;
var skew;
var a11;
var a12;
var a13;
var a22;
var a23;

self.addEventListener("message", function(event) {

    param = event.data;

    calculateIntrinsic(param.dstWidth, param.dstHeight, param.hfov, 0);

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

function pinholeToEqui(x, y) {
    var normalized = normalizeCameraParameters(x, y);
    var rotated = multiplyRotation(normalized.x, normalized.y);
    var latlon = normToLatlon(rotated.x, rotated.y, rotated.z);
    var equiXY = latlonToEqui(latlon.lat, latlon.lon);
    return equiXY;
}

function equiToPinhole(x, y) {

}

function getSrcPixelInterpolation(param, x, y) {
    var data = param.srcData.data;
    if (param.interpolation == 'bilinear') {

    } else {
        x = Math.round(x);
        y = Math.round(y);
        var srcInd = (y * param.srcWidth + x) * 4;

        return [
            data[srcInd + 0],
            data[srcInd + 1],
            data[srcInd + 2],
            data[srcInd + 3]
        ];
    }

}

// Commonly there are two parameters, intrinsic and extrinsic
// But in this situation we suppose that extrinsic is an identity matrix
// because the 
function normalizeCameraParameters(x, y) {
    return {
        x: a11 * x + a12 * y + a13,
        y: a22 * y + a23
    };
}

/*
Rx:     Ry:     Rz:
1 0 0   e 0 f   c -d 0
0 a -b  0 1 0   d c 0
0 b a   -f 0 e  0 0 1

Rx * Rz * Ry:
ce      -d cf       |0 0 1|   -d  cf       ce
ade+bf  ac adf-be   |1 0 0|   ac  adf-be   ade+bf
bde-af  bc bdf+ae   |0 1 0|   bc  bdf+ae   bde-af

(X,Y,Z) = (Rx * Rz * Ry)(PI/2)(x,y,z):

X = (-d)*x + (cf    )*y + (ce    )*1
Y = (ac)*x + (adf-be)*y + (ade+bf)*1
Z = (bc)*x + (bdf+ae)*y + (bde-af)*1
*/
// default yaw=0, pitch=0, roll=0
function multiplyRotation(x, y) {
    // Rx(roll) * Rz(yaw) * Ry(pitch)
    var a = Math.cos(param.gRoll),
        b = Math.sin(param.gRoll);
    var e = Math.cos(param.gPitch),
        f = Math.sin(param.gPitch);
    var c = Math.cos(param.gYaw),
        d = Math.sin(param.gYaw);

    // var X = (c * e) * x - (d) * y + (c * f) * 1;
    // var Y = (a * d * e + b * f) * x + (a * c) * y + (a * d * f - b * e) * 1;
    // var Z = (b * d * e - a * f) * x + (b * c) * y + (b * d * f + a * e) * 1;
    var X = (-d) * x + (c * f) * y + (c * e) * 1;
    var Y = (a * c) * x + (a * d * f - b * e) * y + (a * d * e + b * f) * 1;
    var Z = (b * c) * x + (b * d * f + a * e) * y + (b * d * e - a * f) * 1;

    return {
        x: X,
        y: Y,
        z: Z
    };
}

function normToLatlon(x, y, z) {
    var r = Math.sqrt(x * x + y * y);
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

function equiToLatlon(x, y) {
    // var lat =
    //     var lon =

    //         return {
    //             lat: lat,
    //             lon: lon
    //         }
}

function calculateIntrinsic(pinholeWidth, pinholeHeight, hfov, skew) {
    f = (pinholeWidth / 2.0) / Math.tan(toRadian(hfov) / 2.0);
    cx = pinholeWidth / 2;
    cy = pinholeHeight / 2;
    fx = f;
    fy = f;
    skew = 0;
    a11 = (1.0 / fx);
    a12 = (-skew / (fx * fy));
    a13 = ((skew * cy - cx * fy) / (fx * fy));
    a22 = (1.0 / fy);
    a23 = (-cy / fy);
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