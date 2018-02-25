var express = require('express');
var bodyParser = require('body-parser');
var childProcess = require('child_process');
var fs = require('fs');

const MaxTask = 10;
const port = 1024;

var app = express();
var tasks = new Array();
/*tasks = [{
	fingerprint: 12345678,
	startTime: 123456,
	saveName: "test.xlsx"
	child: child_process,
	status: [error|running|done],
	reason: "",
	total: 245,
	done: 34
}]*/

try {
	fs.accessSync(path.join(__dirname, "excel"));
}
catch(err) {
	fs.mkdirSync("./excel");
}

app.use(express.static('public'));
app.use(bodyParser.json());

app.get("/", function(req, res) {
    console.log("[New Visitors]: " + req.ip.replace(/[^\d\.]/g, ""));
    res.sendfile("./public/index.html");
});

app.post('/start', function(req, res) {
    var fromIP = req.ip.replace(/[^\d\.]/g, "");
    if (getRunningNum() > (MaxTask - 1)) {
        res.json({ result: "fail", reason: "maxTask", maxTask: MaxTask });
        return;
    }
    noCache(res);
    var url = req.body.taskURL;
    var fingerprint = req.body.fingerprint;
    var index = getTaskIndex(fingerprint);
    if (index != -1) {
        if (tasks[index].status == "running") {
            res.json({ result: "fail", reason: "running" });
            return;
        } else {
            tasks.splice(index, 1);
            deleteExcel(fingerprint);
        }
    }
    var child = childProcess.fork("./transport.js", [url, fingerprint, fromIP]);

    console.log("[New Task]: From IP " + fromIP)

    tasks.push({ fingerprint: fingerprint, child: child, status: "running", startTime: (new Date()).getTime() });

    res.json({ result: "success", reason: "" });

    child.on('message', function(msg) {
        var id = getTaskIndex(msg.fingerprint);
        if (id != -1) {
            tasks[id].status = msg.status;
            tasks[id].reason = msg.reason;
            tasks[id].total = msg.total;
            tasks[id].done = msg.done;
            tasks[id].saveName = msg.saveName;
        }
    });
});

app.get("/status", function(req, res) {
    noCache(res);
    var fingerprint = req.query.fingerprint;
    var i = getTaskIndex(fingerprint);
    if (i != -1) {
        res.json({ status: tasks[i].status, reason: tasks[i].reason, total: tasks[i].total, done: tasks[i].done });
    } else {
        res.json({ status: "error", reason: "noProcess" });
    }
})

app.get("/taskNum", function(req, res) {
    noCache(res);
    res.json({ running: getRunningNum(), max: MaxTask });
})

app.get("/download", function(req, res) {
    noCache(res);
    var fingerprint = req.query.fingerprint;
    var files = fs.readdirSync('excel');
    var saveName = "result.xlsx";
    var index = getTaskIndex(fingerprint);
    if (index != -1)
        saveName = tasks[index].saveName;
    if (files.indexOf(fingerprint + ".xlsx") != -1) {
        res.type("application/binary");
        res.download("excel/" + fingerprint + ".xlsx", saveName);
    } else {
        res.json({ status: "fail" });
    }
})

var server = app.listen(port, function() {
    console.log('Bug To Excel web site start at ' + (new Date).toLocaleString());
});

setInterval(clearTask, 1 * 60 * 60);

function getTaskIndex(fingerprint) {
    for (var i in tasks) {
        if (tasks[i].fingerprint == fingerprint)
            return i;
    }
    return -1;
}

function getRunningNum() {
    var num = 0;
    for (var i in tasks) {
        if (tasks[i].status == "running")
            num++;
    }
    return num;
}

function clearTask() {
    var current = (new Date()).getTime();
    for (var i in tasks) {
        if (parseInt((current - tasks[i].startTime) / 1000) > 1 * 60 * 60) {
            deleteExcel(tasks[i].fingerprint);
            tasks.splice(i, 1);
        }
    }
}

function deleteExcel(fingerprint) {
    var file = "excel/" + fingerprint + ".xlsx";
    fs.exists(file, function(exists) {
        if (exists) {
            fs.unlink(file, function(err) {
                if (err) {
                    console.log("Delete " + file + " failed.");
                }
            });
        }
    })
}

function noCache(res) {
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
}