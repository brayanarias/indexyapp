const socket = io();

let localStream;
let peers = {};

const localVideo = document.getElementById('localVideo');
const videos = document.getElementById('videos');
const cameraButton = document.getElementById('cameraButton');
const micButton = document.getElementById('micButton');
const screenButton = document.getElementById('screenButton');
const snapshotButton = document.getElementById('snapshotButton');

async function startCamera() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        const audioDevices = devices.filter(device => device.kind === 'audioinput');

        const constraints = {
            video: { deviceId: videoDevices[0]?.deviceId || undefined },
            audio: { deviceId: audioDevices[0]?.deviceId || undefined }
        };

        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        localVideo.srcObject = localStream;
    } catch (error) {
        console.error('Error accediendo a la cámara/micrófono:', error);
    }
}

function createPeerConnection(id) {
    const peerConnection = new RTCPeerConnection();

    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = event => {
        let remoteVideo = document.getElementById('remote_' + id);
        if (!remoteVideo) {
            remoteVideo = document.createElement('video');
            remoteVideo.id = 'remote_' + id;
            remoteVideo.autoplay = true;
            remoteVideo.playsInline = true;
            remoteVideo.className = 'remoteVideo';
            videos.appendChild(remoteVideo);
        }
        remoteVideo.srcObject = event.streams[0];
    };

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            socket.emit('candidate', { to: id, candidate: event.candidate });
        }
    };

    peers[id] = peerConnection;
    return peerConnection;
}

async function callUser(id) {
    const peerConnection = createPeerConnection(id);
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', { to: id, offer: peerConnection.localDescription });
}

cameraButton.addEventListener('click', () => {
    const videoTrack = localStream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;
    cameraButton.style.backgroundColor = videoTrack.enabled ? 'green' : 'red';
});

micButton.addEventListener('click', () => {
    const audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    micButton.style.backgroundColor = audioTrack.enabled ? 'green' : 'red';
});

screenButton.addEventListener('click', async () => {
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];

        for (let id in peers) {
            const sender = peers[id].getSenders().find(s => s.track.kind === 'video');
            sender.replaceTrack(screenTrack);
        }

        screenTrack.onended = async () => {
            const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
            const cameraTrack = cameraStream.getVideoTracks()[0];
            for (let id in peers) {
                const sender = peers[id].getSenders().find(s => s.track.kind === 'video');
                sender.replaceTrack(cameraTrack);
            }
        };
    } catch (error) {
        console.error('Error compartiendo pantalla:', error);
    }
});

snapshotButton.addEventListener('click', () => {
    const canvas = document.createElement('canvas');
    canvas.width = localVideo.videoWidth;
    canvas.height = localVideo.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(localVideo, 0, 0, canvas.width, canvas.height);
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = 'captura.png';
    link.click();
});

socket.on('connect', () => {
    socket.emit('nuevo-usuario');
});

socket.on('usuarios', usuarios => {
    usuarios.forEach(id => {
        if (id !== socket.id && !peers[id]) {
            callUser(id);
        }
    });
});

socket.on('offer', async data => {
    const peerConnection = createPeerConnection(data.from);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', { to: data.from, answer: peerConnection.localDescription });
});

socket.on('answer', async data => {
    await peers[data.from].setRemoteDescription(new RTCSessionDescription(data.answer));
});

socket.on('candidate', async data => {
    if (peers[data.from]) {
        await peers[data.from].addIceCandidate(new RTCIceCandidate(data.candidate));
    }
});

// Fecha y hora en pantalla
function updateTimestamp() {
    const now = new Date();
    const options = { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', second: '2-digit' };
    const formatted = now.toLocaleTimeString('es-CO', options);
    document.getElementById('timestamp').textContent = `Actualización: ${formatted}`;
}
setInterval(updateTimestamp, 1000);

startCamera();
