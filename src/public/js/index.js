var fingerprint = new Fingerprint().get();
setInterval(getTaskNum, 2000);

$("#saveAccount").on("click", function() {
    if ($("#input-account").val() == "") {
        showAccountTip("Input the url of bug list.");
    } else {
        $("#login").animate({ "marginTop": "5%" });
        $("#alert-bar").fadeOut();
        $.ajaxSetup({ "contentType": "application/json" })
        var data = {
            taskURL: $("#input-account").val(),
            fingerprint: fingerprint
        }
        $.post("/start", JSON.stringify(data), function(data, status) {
            if (data.result == "fail") {
                if (data.reason == "running")
                    showAlert("Warning", "It is running a task for you. Just be patient.");
                else if (data.reason == "maxTask")
                    showAlert("Error", "Reach max tasks limition. Just support up to " + data.maxTask + " processes at the same time.");
                return;
            }
            window.blower = new LoadingBlower("#loadingContainer");
            blower.resetProgress();
            setTimeout(function() {
                $("#progress").fadeIn("slow");
                $("#download").slideUp();
            }, 200)
            window.intval = setInterval(getStatus, 2000);
        })
    }
})

$("#input-account").on("focus", function() {
    $("#input-account").parents(".input-group").addClass("focus");
})

$("#input-account").on("blur", function() {
    $("#input-account").parents(".input-group").removeClass("focus");
})

$("#input-account").on("input", function() {
    var icon = $("#input-account + span > span > span");
    if ($("#input-account").val() != "") {
        icon.removeClass("fui-clip");
        icon.addClass("fui-cross");
        icon.one("click", function() {
            $("#input-account").val("");
            icon.removeClass("fui-cross");
            icon.addClass("fui-clip");
        })
    } else {
        icon.removeClass("fui-cross");
        icon.addClass("fui-clip");
    }
})

$("#download img").on("click", function() {
    ajax_download("/download?fingerprint=" + fingerprint);
    setTimeout(function() {
        $("#download").slideUp();
    }, 200)
})

function showAccountTip(title) {
    $("#input-account").attr("title", title);
    $("#input-account").tooltip("show");
    $(".tooltip.top .tooltip-arrow").css("border-top-color", "#E74C3C");
    $(".tooltip-inner").css("background-color", "#E74C3C");
    setTimeout(function() {
        $("#input-account").tooltip("hide");
    }, 1500);
}

function getStatus() {
    $.get("/status?fingerprint=" + fingerprint, function(data, status) {
        try {
            blower.setProgress(parseInt(data.done / data.total * 100));
        } catch (err) {}
        if (data.status == "error") {
            clearInterval(intval);
            $("#progress").fadeOut();
            setTimeout(function() {
                if (data.reason == "noBug")
                    showAlert("Error", "Can't find any bug from the url you provided.");
                else if (data.reason == "invalid")
                    showAlert("Error", "You may input invalid url. Please check again.");
                else
                    showAlert("Error", "It may occur socket error. Wait other task(s) done and try again.");
            }, 300);
        } else if (data.status == "done") {
            clearInterval(intval);
        }
    });
}

function getTaskNum() {
    $.get("/taskNum", function(data, status) {
        $("#running_task").text(data.running + "/" + data.max);
        if ($("#task_tip").css("visibility") == "hidden")
            $("#task_tip").css("visibility", "");
    });
}

function ajax_download(url) {
    var $iframe;

    if (($iframe = $('#download_iframe')).length === 0) {
        $iframe = $("<iframe id='download_iframe'" +
            " style='display: none' src='" + url + "'></iframe>"
        ).appendTo("body");
    }
}

function showAlert(flag, str) {
    $("#alert-body").remove();
    var alert_body = $('<div class="alert alert-dismissible" role="alert" id="alert-body"><button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button><span></span></div>');
    if (flag == "Warning") {
        alert_body.addClass("alert-warning");
    } else if (flag == "Error") {
        alert_body.addClass("alert-danger");
    }
    alert_body.children("span").html("<strong>" + flag + "!<strong> " + str);
    alert_body.appendTo("#alert-row");
    $("#alert-bar").fadeIn();
    setTimeout(function() {
        $("#alert-bar").fadeOut();
    }, 8000);
}