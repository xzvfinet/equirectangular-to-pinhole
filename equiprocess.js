// Parameters
var param = {};
// Desired rotation
var cosRoll, sinRoll, cosPitch, sinPitch, cosYaw, sinYaw;

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

function pinholeToSphere(x, y) {
    var normalized = normalizeCameraParameters(x, y);
    var rotated = multiplyRotation(normalized.x, normalized.y);

    return {x:rotated.x, y:rotated.y, z:rotated.z};
}

function sphereToPinhole(x, y, z) {
    var normalized = divideRotation(x, y, z);
    var pinhole = applyCameraParameters(normalized.x, normalized.y);

    return {x:pinhole.x, y:pinhole.y};
}

function equiToSphere(x, y) {

}

function sphereToEqui(x, y, z) {
    var latlon = normToLatlon(x, y, z);
    var equiXY = latlonToEqui(latlon.lat, latlon.lon);
    return equiXY;
}

function pinholeToEqui(x, y) {
    var spherePoint = pinholeToSphere(x, y);
    var equiPoint = sphereToEqui(spherePoint.x, spherePoint.y, spherePoint.z);
    return equiPoint;
}

function equiToPinhole(x, y) {
    // equi to lat lon
    var spherePoint = equiToSphere(x, y);
    var pinholePoint = sphereToPinhole(spherePoint.x, spherePoint.y, spherePoint.z);
    return pinholePoint;
}

// Commonly there are two parameters, intrinsic and extrinsic
// But in this situation we suppose that extrinsic is an identity matrix
var a11,a12,a13,a22,a23;
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
|ce      -d cf    |
|ade+bf  ac adf-be|
|bde-af  bc bdf+ae|

Rx(PI/2) * Ry(PI/2):
|1 0  0|   | 0 0 1|   |0 0 1|
|0 0 -1| X | 0 1 0| = |1 0 0|
|0 1  0|   |-1 0 0|   |0 1 0|

Rx * Rz * Ry * Rx(PI/2) * Ry(PI/2):
|ce      -d cf    |   |0 0 1|   |-d  cf       ce    |
|ade+bf  ac adf-be| X |1 0 0| = |ac  adf-be   ade+bf|
|bde-af  bc bdf+ae|   |0 1 0|   |bc  bdf+ae   bde-af|

(X,Y,Z) = (Rx * Rz * Ry) * Rx(PI/2)*Ry(PI/2) * (x,y,1):

X = (-d)*x + (cf    )*y + (ce    )*1
Y = (ac)*x + (adf-be)*y + (ade+bf)*1
Z = (bc)*x + (bdf+ae)*y + (bde-af)*1
*/
// default yaw=0, pitch=0, roll=0
function multiplyRotation(x, y) {
    // Rx(roll) * Rz(yaw) * Ry(pitch)
    var X = (-sinYaw) * x + (cosYaw * sinPitch) * y + (cosYaw * cosPitch) * 1;
    var Y = (cosRoll * cosYaw) * x + (cosRoll * sinYaw * sinPitch - sinRoll * cosPitch) * y + (cosRoll * sinYaw * cosPitch + sinRoll * sinPitch) * 1;
    var Z = (sinRoll * cosYaw) * x + (sinRoll * sinYaw * sinPitch + cosRoll * cosPitch) * y + (sinRoll * sinYaw * cosPitch - cosRoll * sinPitch) * 1;

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
        b = cosYaw*sinPitch,
        c = cosYaw*cosPitch,
        d = cosRoll*cosYaw,
        e = cosRoll*sinYaw*sinPitch-sinRoll*cosPitch,
        f = cosRoll*sinYaw*cosPitch+sinRoll*sinPitch,
        g = sinRoll*cosYaw,
        h = sinRoll*sinYaw*sinPitch+cosRoll*cosPitch,
        i = sinRoll*sinYaw*cosPitch-cosRoll*sinPitch;

    var det = a*e*i - a*f*h - b*d*i + b*f*g + c*d*h - c*e*g;
    var iDet = 1/det;

    var m = [
    [e*i-f*h, c*h-b*i, b*f-c*e],
    [f*g-d*i, a*i-c*g, c*d-a*f],
    [d*h-e*g, b*g-a*h, a*e-b*d]
    ];

    var X, Y, Z;
    Z = (m[2][0]*x + m[2][1]*y + m[2][2]*z)*iDet;
    X = (m[0][0]*x + m[0][1]*y + m[0][2]*z)/Z*iDet;
    Y = (m[1][0]*x + m[1][1]*y + m[1][2]*z)/Z*iDet;

    return {
        x: X,
        y: Y
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
    var f = (pinholeWidth / 2.0) / Math.tan(toRadian(hfov) / 2.0);
    var cx = pinholeWidth / 2;
    var cy = pinholeHeight / 2;
    var fx = f;
    var fy = f;
    var skew = 0;
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