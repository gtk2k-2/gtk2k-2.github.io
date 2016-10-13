window.RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection;
BroadcastChannel.prototype.send = function(data) {
    this.postMessage(data);
}
var signalingChannel = new BroadcastChannel("WebRTC_Sample");
//var configuration = { "iceServers": [{ "urls": "stuns:stun.example.org" }] };
var pc;

function videoStream(user) {
    return new Promise(function(resolve, reject) {
        var vid = document.createElement("video");
        var cnv = document.createElement("canvas");
        var ctx = cnv.getContext("2d");
        var drawVideo = function() {
            requestAnimationFrame(drawVideo);
            cnv.drawImage(vid, 0, 0);
        };
        vid.loop = true;
        vid.src = user === "Alice" ? "Big_Buck_Bunny_Trailer.m4v" : "sintel.mp4";
        vid.oncanplay = function() {
            cnv.width = vid.videoWidth;
            cnv.height = vid.videoHeight;
            drawVideo();
        };
        vid.play();
        var stream = cnv.captureStream();
        resolve(stream);
    });
}

// call start() to initiate
function start(user) {
    pc = new RTCPeerConnection(null);

    // send any ice candidates to the other peer
    pc.onicecandidate = function (evt) {
        signalingChannel.send(JSON.stringify({ "candidate": evt.candidate }));
    };

    // let the "negotiationneeded" event trigger offer generation
    pc.onnegotiationneeded = function () {
        pc.createOffer().then(function (offer) {
            return pc.setLocalDescription(offer);
        })
        .then(function () {
            // send the offer to the other peer
            signalingChannel.send(JSON.stringify({ "desc": pc.localDescription }));
        })
        .catch(logError);
    };

    // once remote video track arrives, show it in the remote video element
    pc.ontrack = function (evt) {
        if (evt.track.kind === "video")
          remoteView.srcObject = evt.streams[0];
    };
    
    pc.onaddstream = function(evt) {
        remoteView.srcObject = evt.stream;
    }

    // get a local stream, show it in a self-view and add it to be sent
    navigator.mediaDevices.enumerateDevices()
        .then(function(devices) {
            var videoInputs = devices.filter(function(device) {
                return device.kind === "videoinput";
            });
            var idx = user === "Alice" ? 0 : 1;
            if(videoInputs[idx]) {
                return navigator.mediaDevices.getUserMedia({ "audio": false, "video": {deviceId: videoInputs[idx].deviceId} })
            } else {
                return videoStream(user);
            }
        })
        .then(function (stream) {
            selfView.srcObject = stream;
            pc.addStream(stream);
            //pc.addTrack(stream.getAudioTracks()[0], stream);
            //pc.addTrack(stream.getVideoTracks()[0], stream);
        })
        .catch(logError);
}

signalingChannel.onmessage = function (evt) {
    if (!pc)
        start("Alice");

    var message = JSON.parse(evt.data);
    if(message.join) {
        start("Bob");
    } else if (message.desc) {
        var desc = message.desc;

        // if we get an offer, we need to reply with an answer
        if (desc.type == "offer") {
            pc.setRemoteDescription(desc).then(function () {
                return pc.createAnswer();
            })
            .then(function (answer) {
                return pc.setLocalDescription(answer);
            })
            .then(function () {
                var str = JSON.stringify({ "desc": pc.localDescription });
                signalingChannel.send(str);
            })
            .catch(logError);
        } else if (desc.type == "answer") {
            pc.setRemoteDescription(desc).catch(logError);
        } else {
            console.log("Unsupported SDP type. Your code may differ here.");
        }
    } else
        pc.addIceCandidate(message.candidate).catch(logError);
};

function logError(error) {
    console.log(error.name + ": " + error.message);
}

signalingChannel.send('{ "join": true }');
