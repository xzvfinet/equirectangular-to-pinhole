// Camera parameters
var srcWidth = 1024;
var srcHeight = 512;
var dstWidth = 400;
var dstHeight = 300;
var hfov = 80; //  in degrees
var gYaw = 0,
    gPitch = 0,
    gRoll = 0;

self.addEventListener("message", function(event) {
    var counter = 0;

    if (!event.data || !event.data.srcData) {
        console.log('no data for worker');
        return;
    }

    srcWidth = event.data.srcWidth;
    srcHeight = event.data.srcHeight;
    dstWidth = event.data.dstWidth;
    dstHeight = event.data.dstHeight;
    hfov = event.data.hfov;
    gYaw = event.data.gYaw;
    gPitch = event.data.gPitch;
    gRoll = event.data.gRoll;

    var pixMap = [];
    var index = 0;

    var length = dstHeight / 100;
    var adder = length;
    for (var row = 0; row < dstHeight; ++row) {
        for (var col = 0; col < dstWidth; ++col) {
            if (row >= length) {
                length += adder;
                self.postMessage({ counter: ++counter });
            }

            var equi = pinholeToEqui(col, row);
            equi.x = Math.round(equi.x);
            equi.y = Math.round(equi.y);
            pixMap[index++] = equi;
        }
    }

    var size = 4 * dstWidth * dstHeight;
    var dstData = event.data.dstData;
    var srcData = event.data.srcData;
    length = size / 100;
    adder = length;
    for (var ind = 0, index = 0; ind < size; ind += 4, ++index) {
        if (ind >= length) {
            length += adder;
            self.postMessage({ counter: ++counter });
        }
        equi = pixMap[index];

        var srcInd = equi.y * srcWidth + equi.x;
        dstData.data[ind + 0] = srcData.data[srcInd*4 + 0];
        dstData.data[ind + 1] = srcData.data[srcInd*4 + 1];
        dstData.data[ind + 2] = srcData.data[srcInd*4 + 2];
        dstData.data[ind + 3] = 255;
    }

    self.postMessage({ finished: true, dstData: dstData });
});

function pinholeToEqui(x, y) {
    var normalized = normalizeIntrinsic(x, y);
    // console.log('normalized');
    // console.log(normalized);
    var rotated = multiplyRotation(normalized.x, normalized.y, gYaw, gPitch, gRoll);
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

var f = (dstWidth / 2.0) / Math.tan(toRadian(hfov) / 2.0);
var cx = dstWidth / 2;
var cy = dstHeight / 2;
var fx = f;
var fy = f;
var skew = 0;

var a11 = (1.0 / fx);
var a12 = (-skew / (fx * fy));
var a13 = ((skew * cy - cx * fy) / (fx * fy));
var a22 = (1.0 / fy);
var a23 = (-cy / fy);

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
function multiplyRotation(x, y, yaw, pitch, roll) {
    // Rx(roll) * Rz(yaw) * Ry(pitch)
    var a = Math.cos(roll),
        b = Math.sin(roll);
    var e = Math.cos(pitch),
        f = Math.sin(pitch);
    var c = Math.cos(yaw),
        d = Math.sin(yaw);

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
    var x = wrapZeroToOne(lon / (Math.PI * 2) + 0.5) * srcWidth;
    var y = reflectZeroToOne(lat / Math.PI + 0.5) * (srcHeight - 1);
    y = srcHeight - y - 1;
    return {
        x: x,
        y: y
    }
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
