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
    var counter = 0;

    param = event.data;

    calculateIntrinsic(param.dstWidth, param.dstHeight, param.hfov, 0);

    var length = param.dstHeight / 100;
    var adder = length;

    var result = {};

    if (param.direction == "forward") {
        if (!param || !param.srcData) {
            console.log('no data for worker');
            return;
        }

        var pixMap = [];
        var index = 0;

        var minVal = { x: Number.MAX_SAFE_INTEGER, y: Number.MAX_SAFE_INTEGER },
            maxVal = { x: 0, y: 0 };

        for (var row = 0; row < param.dstHeight; ++row) {
            for (var col = 0; col < param.dstWidth; ++col) {
                if (row >= length) {
                    length += adder;
                    self.postMessage({ counter: ++counter });
                }

                var equi = pinholeToEqui(col, row);
                equi.x = Math.round(equi.x);
                equi.y = Math.round(equi.y);
                pixMap[index++] = equi;

                // min max for original bounding box
                if (equi.x < minVal.x) minVal.x = equi.x;
                else if (equi.x > maxVal.x) maxVal.x = equi.x
                if (equi.y < minVal.y) minVal.y = equi.y;
                else if (equi.y > maxVal.y) maxVal.y = equi.y
            }
        }

        var originalSize = {
            x: maxVal.x - minVal.x,
            y: maxVal.y - minVal.y
        };

        var size = 4 * param.dstWidth * param.dstHeight;
        var dstData = param.dstData;
        var srcData = param.srcData;
        length = size / 100;
        adder = length;
        for (var ind = 0, index = 0; ind < size; ind += 4, ++index) {
            if (ind >= length) {
                length += adder;
                self.postMessage({ counter: ++counter });
            }
            equi = pixMap[index];

            var srcInd = (equi.y * param.srcWidth + equi.x) * 4;
            dstData.data[ind + 0] = srcData.data[srcInd + 0];
            dstData.data[ind + 1] = srcData.data[srcInd + 1];
            dstData.data[ind + 2] = srcData.data[srcInd + 2];
            dstData.data[ind + 3] = srcData.data[srcInd + 3];
        }

        result.dstData = dstData;

    } else if (param.direction == "backward") {
        var mixedData = param.mixedData;
        var resultData = param.resultData;
        console.log(mixedData);
        console.log(resultData);

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
                // console.log(equi);

                var ind_mixed = (row * mixedData.width + col) * 4;
                var ind_orig = (equi.y * resultData.width + equi.x) * 4;
                resultData.data[ind_orig + 0] = mixedData.data[ind_mixed + 0];
                resultData.data[ind_orig + 1] = mixedData.data[ind_mixed + 1];
                resultData.data[ind_orig + 2] = mixedData.data[ind_mixed + 2];
                resultData.data[ind_orig + 3] = mixedData.data[ind_mixed + 3];
            }
        }

        result.resultData = resultData;
    } else if (param.direction == "unit") {
        var points = param.points;
        var equiPoints = [];

        for (var i in points) {
            equiPoints.push(pinholeToEqui(points[i].x, points[i].y));
        }

        result.equiPoints = equiPoints;
    }

    self.postMessage({ direction: param.direction, finished: true, result: result });
});

function pinholeToEqui(x, y) {
    var normalized = normalizeIntrinsic(x, y);
    // console.log('normalized');
    // console.log(normalized);
    var rotated = multiplyRotation(normalized.x, normalized.y);
    // console.log('rotated');
    // console.log(rotated);
    var latlon = normToLatlon(rotated.x, rotated.y, rotated.z);
    // console.log('latlon');
    // console.log(latlon);
    var equiXY = latlonToEqui(latlon.lat, latlon.lon);
    // console.log('equiXY');
    // console.log(equiXY);
    return equiXY;
}

function normalizeIntrinsic(x, y) {
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
ce      -d cf
ade+bf  ac adf-be
bde-af  bc bdf+ae

Rx * Rz * Ry * (PI/2):
(-d)*x + (cf    )*y + (ce)*1
(ac)*x + (adf-be)*y + (ade+bf)*1
(bc)*x + (bdf+ae)*y + (bde-af)*1
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
