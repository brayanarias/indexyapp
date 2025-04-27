const localVideo = document.createElement('video');
localVideo.autoplay = true;
localVideo.muted = true;
document.body.appendChild(localVideo);

const remoteVideo = document.createElement('video');
remoteVideo.autoplay = true;
document.body.appendChild(remoteVideo);

const peerConnections = {}; // Para múltiples conexiones
let localStream;

const socket = new WebSocket('wss://servidor-senalizacion-production.up.railway.app/');

socket.addEventListener('open', () => {
    console.log('Conectado al servidor de señalización');
});

socket.addEventListener('message', async (event) => {
    const data = JSON.parse(event.data);

    switch (data.type) {
        case 'welcome':
            window.myId = data.id;
            console.log('Tu ID es: ', window.myId);
            // Anunciar presencia
            socket.send(JSON.stringify({ type: 'join', id: window.myId }));
            break;
        case 'offer':
            await handleOffer(data.offer, data.from);
            break;
        case 'answer':
            await handleAnswer(data.answer, data.from);
            break;
        case 'candidate':
            await handleCandidate(data.candidate, data.from);
            break;
    }
});

// Funciones de conexión WebRTC
async function createPeerConnection(id) {
    const peerConnection = new RTCPeerConnection();
    peerConnections[id] = peerConnection;

    // Añadir nuestras pistas locales
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    // Cuando recibimos pistas remotas
    peerConnection.ontrack = event => {
        remoteVideo.srcObject = event.streams[0];
    };

    // Cuando hay un nuevo candidato ICE
    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            socket.send(JSON.stringify({
                type: 'candidate',
                to: id,
                candidate: event.candidate
            }));
        }
    };

    return peerConnection;
}

async function handleOffer(offer, fromId) {
    const peerConnection = await createPeerConnection(fromId);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.send(JSON.stringify({
        type: 'answer',
        to: fromId,
        answer
    }));
}

async function handleAnswer(answer, fromId) {
    const peerConnection = peerConnections[fromId];
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
}

async function handleCandidate(candidate, fromId) {
    const peerConnection = peerConnections[fromId];
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
}

// Conseguir cámara y micrófono
async function startCamera() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
    } catch (err) {
        console.error('Error al acceder a la cámara o micrófono', err);
    }
}

startCamera();
