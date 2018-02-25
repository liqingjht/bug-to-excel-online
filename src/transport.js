var request = require("request")
var cheerio = require("cheerio");
var Excel = require('exceljs');
var Agent = require('agentkeepalive');
var fs = require('fs');

var url = process.argv[2];
var fingerprint = process.argv[3];
var ip = "[" + process.argv[4] + "]: ";
var splitLength = 200;

var today = new Date();
var fileName = "BugList-" + today.getFullYear() + "-" + (today.getMonth() + 1) + "-" + today.getDate() + ".xlsx";

msg = {
    fingerprint: fingerprint,
    saveName: fileName,
    status: "running",
    reason: "",
    total: 0,
    done: 0
}

url = decodeURIComponent(url);
url = encodeURI(url);

var urlIndex = url.indexOf("/bugzilla3/");
if (urlIndex != -1) {
    var root = url.slice(0, urlIndex + 11);
} else {
    var root = url.replace(/^((https?:\/\/)?[^\/]*\/).*/ig, "$1");
    root = (/^http/ig.test(root) ? root : "http://" + root);
}
var bugUrl = root + "show_bug.cgi";

Agent = (root.toLowerCase().indexOf("https://") != -1) ? Agent.HttpsAgent : Agent;
var keepaliveAgent = new Agent({
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 60000,
    freeSocketKeepAliveTimeout: 60000
});

var option = {
    agent: keepaliveAgent,
    headers: { "User-Agent": "NodeJS", Host: url.replace(/^((https?:\/\/)?([^\/]*)\/).*/g, "$3") },
    url: url
};

getFunc(option, function(url, $) {
    var bugs = new Array();
    var td = $("table.bz_buglist tr td.bz_id_column a");
    td.each(function(key) {
        bugs.push("id=" + td.eq(key).text());
    })
    if (bugs.length > 0) {
        msg.total = bugs.length;
        msg.done = Math.floor(bugs.length * 0.2);
        process.send(msg);
    } else {
        msg.status = "error";
        msg.reason = "noBug";
        process.send(msg);
        process.exit(1);
    }

    return bugs;
}).then(function(bugs) {
    var splitBugs = new Array();
    do {
        splitBugs.push(bugs.splice(0, splitLength));
    }
    while (bugs.length > 0)

    var done = 0;

    return Promise.all(splitBugs.map(function(eachGroup, index) {
        var splitPromise = getLongFormat(eachGroup);

        splitPromise.then(function() {
            done += eachGroup.length;
            msg.done = done;
            process.send(msg);
        })

        return splitPromise;
    }))
}).then(function(allGroup) {
    var bugLists = new Array();
    for (var i in allGroup) {
        bugLists = bugLists.concat(allGroup[i]);
    }

    var workbook = new Excel.Workbook();
    var productNum = 0;
    for (var i in bugLists) {
        var bugInfo = bugLists[i];
        var sheet = workbook.getWorksheet(bugInfo.product);
        if (sheet === undefined) {
            sheet = workbook.addWorksheet(bugInfo.product);
            console.log(ip + "To get " + bugInfo.product);
            productNum++;
        }
        try {
            sheet.getColumn("id");
        } catch (error) {
            sheet.columns = [
                { header: 'Bug ID', key: 'id' },
                { header: 'Summary', key: 'summary', width: 35 },
                { header: 'Bug Detail', key: 'detail', width: 75 },
                { header: 'Priority', key: 'priority', width: 8 },
                { header: 'Version', key: 'version', width: 15 },
                { header: 'Status', key: 'status', width: 15 },
                { header: 'Component', key: 'component', width: 15 },
                { header: 'Comments', key: 'comment', width: 60 },
                { header: 'Assign To', key: 'assign', width: 20 },
                { header: 'Reporter', key: 'reporter', width: 20 },
            ];
        }
        var comment = "";
        for (var j in bugInfo.comment) {
            comment += bugInfo.comment[j].who + " (" + bugInfo.comment[j].when + " ):\r\n";
            comment += bugInfo.comment[j].desc.replace(/\n/gm, "\r\n") + "\r\n";
            comment += "-------------------------------------------------------\r\n"
        }
        sheet.addRow({
            id: { text: bugInfo.id, hyperlink: bugInfo.url },
            summary: bugInfo.summary,
            detail: bugInfo.detail.replace(/\n/gm, "\r\n"),
            priority: bugInfo.priority,
            version: bugInfo.version,
            status: bugInfo.status,
            component: bugInfo.component,
            comment: comment,
            assign: bugInfo.assign,
            reporter: bugInfo.reporter,
        });
        sheet.eachRow(function(Row, rowNum) {
            Row.eachCell(function(Cell, cellNum) {
                if (rowNum == 1)
                    Cell.alignment = { vertical: 'middle', horizontal: 'center', size: 25, wrapText: true }
                else
                    Cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true }
            })
        })
    }

    fileName = ((productNum > 1) ? "" : bugInfo.product + "-") + fileName + ".xlsx";

    return workbook.xlsx.writeFile("./excel/" + fingerprint + ".xlsx");
}).then(function() {
    msg.status = "done";
    msg.saveName = fileName;
    process.send(msg);
    console.log(ip + "Success!");
}).catch(function(err) {
    msg.status = "error";
    msg.reason = "invalid";
    console.log(ip + "Fail!");
    console.log(err);
    process.send(msg);
})

function getFunc(getOption, parseFunc) {
    return new Promise(function(resolve, reject) {
        request.get(getOption, function(error, response, body) {
            if (!error && response.statusCode == 200) {
                var $ = cheerio.load(body);
                var result = parseFunc(getOption.url, $);
                resolve(result);
            } else {
                reject(error);
            }
        })
    })
}

function postFunc(postUrl, data, callback) {
    return new Promise(function(resolve, reject) {
        option.url = postUrl;
        option.body = data;
        request.post(option, function(error, response, body) {
            if (!error && response.statusCode == 200) {
                var result = callback(postUrl, body);
                resolve(result);
            } else {
                reject(error);
            }
        })
    })
}

function getLongFormat(bugs) {
    var postData = bugs.join("&") + "&ctype=xml&excludefield=attachmentdata";
    return postFunc(bugUrl, postData, function(url, data) {
        var $ = cheerio.load(data);
        var xmlLists = $("bugzilla bug");
        var bugLists = new Array();
        xmlLists.each(function(key) {
            var oneBug = xmlLists.eq(key);
            var oneInfo = new Object();
            oneInfo.id = oneBug.children("bug_id").text();
            oneInfo.url = bugUrl + "?id=" + oneInfo.id;
            oneInfo.summary = oneBug.children("short_desc").text();
            oneInfo.reporter = oneBug.children("reporter").text();
            oneInfo.product = oneBug.children("product").text();
            oneInfo.component = oneBug.children("component").text();
            oneInfo.version = oneBug.children("version").text();
            oneInfo.status = oneBug.children("bug_status").text();
            oneInfo.priority = oneBug.children("priority").text();
            oneInfo.security = oneBug.children("bug_security").text();
            oneInfo.assign = oneBug.children("assigned_to").text();
            oneInfo.comment = new Array();
            var comments = oneBug.children("long_desc");
            comments.each(function(key) {
                var who = comments.eq(key).find("who").text();
                var when = comments.eq(key).find("bug_when").text();
                when = when.replace(/([^\s]+)\s.*$/g, "$1");
                var desc = comments.eq(key).find("thetext").text();
                if (key == 0 && who == oneInfo.reporter) {
                    oneInfo.detail = desc;
                    return true;
                }
                oneInfo.comment.push({ 'who': who, 'when': when, 'desc': desc });
            })
            if(oneInfo.detail === undefined)
                oneInfo.detail = '';
            bugLists.push(oneInfo);
        })

        msg.done = bugLists.length;
        process.send(msg);

        return bugLists;
    })
}