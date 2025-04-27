const localVideo = document.getElementById('localVideo');
const remoteVideosContainer = document.getElementById('remoteVideosContainer');
const cameraButton = document.getElementById('cameraButton');
const micButton = document.getElementById('micButton');
const screenButton = document.getElementById('screenButton');
const updateTimestamp = document.getElementById('updateTimestamp');

let localStream;
let peers = {};
let socket = new WebSocket('wss://servidor-senalizacion-production.up.railway.app');

// Fecha de última actualización
const now = new Date();
updateTimestamp.innerText = `Actualizado: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;

// Conexión al servidor de señalización
socket.addEventListener('open', () => {
    console.log('Conectado al servidor de señalización');
    socket.send(JSON.stringify({ type: 'nuevo-usuario' }));
});

// Manejo de mensajes
socket.addEventListener('message', async event => {
    const data = JSON.parse(event.data);

    if (data.type === 'id') {
        console.log('Tu ID es:', data.id);
    } else if (data.type === 'offer') {
        const peerConnection = createPeerConnection(data.from);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        socket.send(JSON.stringify({ type: 'answer', answer, to: data.from }));
    } else if (data.type === 'answer') {
        if (peers[data.from]) {
            await peers[data.from].setRemoteDescription(new RTCSessionDescription(data.answer));
        }
    } else if (data.type === 'candidate') {
        if (peers[data.from]) {
            await peers[data.from].addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    } else if (data.type === 'new-user') {
        console.log('Nuevo usuario conectado:', data.id);
        callUser(data.id);
    } else if (data.type === 'user-disconnected') {
        console.log('Usuario desconectado:', data.id);
        if (peers[data.id]) {
            peers[data.id].close();
            delete peers[data.id];
            const videoToRemove = document.getElementById(`video-${data.id}`);
            if (videoToRemove) {
                videoToRemove.remove();
            }
        }
    }
});

// Crear conexión
function createPeerConnection(id) {
    const peerConnection = new RTCPeerConnection();

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    peerConnection.ontrack = event => {
        let remoteVideo = document.getElementById(`video-${id}`);
        if (!remoteVideo) {
            remoteVideo = document.createElement('video');
            remoteVideo.id = `video-${id}`;
            remoteVideo.autoplay = true;
            remoteVideo.playsInline = true;
            remoteVideo.style.width = '200px';
            remoteVideo.style.height = '150px';
            remoteVideo.style.margin = '10px';
            remoteVideo.style.border = '2px solid green';
            remoteVideosContainer.appendChild(remoteVideo);
        }
        remoteVideo.srcObject = event.streams[0];
    };

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            socket.send(JSON.stringify({ type: 'candidate', candidate: event.candidate, to: id }));
        }
    };

    peers[id] = peerConnection;
    return peerConnection;
}

// Llamar a otro usuario
async function callUser(id) {
    const peerConnection = createPeerConnection(id);
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    socket.send(JSON.stringify({ type: 'offer', offer, to: id }));
}

// Activar cámara/micrófono
async function startCamera() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
    } catch (error) {
        console.error('Error accediendo a la cámara/micrófono:', error);
    }
}

// Botones
cameraButton.addEventListener('click', () => {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        videoTrack.enabled = !videoTrack.enabled;
        updateButtonColor(cameraButton, videoTrack.enabled);
    }
});

micButton.addEventListener('click', () => {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        audioTrack.enabled = !audioTrack.enabled;
        updateButtonColor(micButton, audioTrack.enabled);
    }
});

screenButton.addEventListener('click', async () => {
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];

        // Cambiar para cada conexión
        for (let id in peers) {
            const sender = peers[id].getSenders().find(s => s.track.kind === 'video');
            sender.replaceTrack(screenTrack);
        }

        // Mostrar pantalla compartida en tu propio video
        localVideo.srcObject = screenStream;

        screenTrack.onended = async () => {
            const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
            const cameraTrack = cameraStream.getVideoTracks()[0];

            for (let id in peers) {
                const sender = peers[id].getSenders().find(s => s.track.kind === 'video');
                sender.replaceTrack(cameraTrack);
            }

            localVideo.srcObject = cameraStream;
            localStream = cameraStream;
        };
    } catch (error) {
        console.error('Error compartiendo pantalla:', error);
    }
});

// Cambiar color de botones
function updateButtonColor(button, isEnabled) {
    if (isEnabled) {
        button.style.backgroundColor = 'green';
        button.style.color = 'white';
    } else {
        button.style.backgroundColor = 'red';
        button.style.color = 'white';
    }
}

// Inicializar
startCamera();
