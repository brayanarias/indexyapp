const socket = new WebSocket('wss://servidor-senalizacion-production.up.railway.app');
let localStream;
let peers = {}; // Para manejar múltiples conexiones

// Elementos de la interfaz
const localVideo = document.createElement('video');
localVideo.autoplay = true;
localVideo.muted = true;
document.body.insertBefore(localVideo, document.body.firstChild);

const remoteContainer = document.createElement('div');
document.body.appendChild(remoteContainer);

// Botones
const toggleCameraButton = document.getElementById('toggleCamera');
const toggleMicButton = document.getElementById('toggleMic');
const shareScreenButton = document.getElementById('shareScreen');

// Variables de control
let cameraOn = true;
let micOn = true;

// Al conectarse al servidor
socket.addEventListener('open', () => {
    console.log('Conectado al servidor de señalización');
});

// Recibir mensajes del servidor
socket.addEventListener('message', async (event) => {
    const message = JSON.parse(event.data);
    const { type, from, offer, answer, candidate, users } = message;

    if (type === 'welcome') {
        console.log('Tu ID es:', message.id);
    }

    if (type === 'users') {
        for (const userId of users) {
            if (!peers[userId]) {
                await callUser(userId);
            }
        }
    }

    if (type === 'offer') {
        await handleOffer(from, offer);
    }

    if (type === 'answer') {
        await peers[from].setRemoteDescription(new RTCSessionDescription(answer));
    }

    if (type === 'candidate') {
        if (peers[from]) {
            await peers[from].addIceCandidate(new RTCIceCandidate(candidate));
        }
    }
});

// Obtener cámara y micrófono
async function startMedia() {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
}

startMedia();

// Crear una conexión
async function createPeerConnection(userId) {
    const peerConnection = new RTCPeerConnection();
    
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.send(JSON.stringify({ type: 'candidate', to: userId, candidate: event.candidate }));
        }
    };

    peerConnection.ontrack = (event) => {
        let remoteVideo = document.getElementById(`remote-${userId}`);
        if (!remoteVideo) {
            remoteVideo = document.createElement('video');
            remoteVideo.id = `remote-${userId}`;
            remoteVideo.autoplay = true;
            remoteVideo.playsInline = true;
            remoteContainer.appendChild(remoteVideo);
        }
        remoteVideo.srcObject = event.streams[0];
    };

    return peerConnection;
}

// Llamar a un usuario
async function callUser(userId) {
    const peerConnection = await createPeerConnection(userId);
    peers[userId] = peerConnection;

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    socket.send(JSON.stringify({ type: 'offer', to: userId, offer }));
}

// Manejar ofertas
async function handleOffer(userId, offer) {
    const peerConnection = await createPeerConnection(userId);
    peers[userId] = peerConnection;

    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.send(JSON.stringify({ type: 'answer', to: userId, answer }));
}

// Botones para controlar cámara, micrófono y compartir pantalla
toggleCameraButton.addEventListener('click', () => {
    cameraOn = !cameraOn;
    localStream.getVideoTracks()[0].enabled = cameraOn;
});

toggleMicButton.addEventListener('click', () => {
    micOn = !micOn;
    localStream.getAudioTracks()[0].enabled = micOn;
});

shareScreenButton.addEventListener('click', async () => {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const screenTrack = screenStream.getVideoTracks()[0];
    
    for (const userId in peers) {
        const sender = peers[userId].getSenders().find(s => s.track.kind === 'video');
        if (sender) {
            sender.replaceTrack(screenTrack);
        }
    }

    screenTrack.onended = async () => {
        const videoTrack = localStream.getVideoTracks()[0];
        for (const userId in peers) {
            const sender = peers[userId].getSenders().find(s => s.track.kind === 'video');
            if (sender) {
                sender.replaceTrack(videoTrack);
            }
        }
    };
});
