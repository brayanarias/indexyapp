const localVideo = document.getElementById('localVideo');
const remoteVideosContainer = document.getElementById('remoteVideosContainer');
const cameraButton = document.getElementById('cameraButton');
const micButton = document.getElementById('micButton');
const screenButton = document.getElementById('screenButton');
const lastUpdateLabel = document.getElementById('lastUpdate');

let localStream;
let peers = {};
let socket = new WebSocket('wss://servidor-senalizacion-production.up.railway.app');

socket.addEventListener('open', () => {
    console.log('Conectado al servidor de señalización');
    socket.send(JSON.stringify({ type: 'nuevo-usuario' }));
});

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
        await peers[data.from].setRemoteDescription(new RTCSessionDescription(data.answer));
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
        }
        const video = document.getElementById(`video-${data.id}`);
        if (video) {
            video.remove();
        }
    }
});

function createPeerConnection(id) {
    const peerConnection = new RTCPeerConnection();

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    peerConnection.ontrack = event => {
        const remoteVideo = document.createElement('video');
        remoteVideo.id = `video-${id}`;
        remoteVideo.srcObject = event.streams[0];
        remoteVideo.autoplay = true;
        remoteVideo.playsInline = true;
        remoteVideo.style.width = '300px';
        remoteVideo.style.height = '300px';
        remoteVideo.style.border = '2px solid green';
        remoteVideo.style.margin = '10px';
        remoteVideosContainer.appendChild(remoteVideo);
    };

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            socket.send(JSON.stringify({ type: 'candidate', candidate: event.candidate, to: id }));
        }
    };

    peers[id] = peerConnection;
    return peerConnection;
}

async function callUser(id) {
    const peerConnection = createPeerConnection(id);
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    socket.send(JSON.stringify({ type: 'offer', offer, to: id }));
}

async function startCamera() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
    } catch (error) {
        console.error('Error accediendo a la cámara/micrófono:', error);
    }
}

// Botones con cambios visuales

cameraButton.addEventListener('click', () => {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        videoTrack.enabled = !videoTrack.enabled;
        cameraButton.style.backgroundColor = videoTrack.enabled ? 'green' : 'red';
    }
});

micButton.addEventListener('click', () => {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        audioTrack.enabled = !audioTrack.enabled;
        micButton.style.backgroundColor = audioTrack.enabled ? 'green' : 'red';
    }
});

screenButton.addEventListener('click', async () => {
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];

        // Reemplazar video para otros peers
        for (let id in peers) {
            const sender = peers[id].getSenders().find(s => s.track.kind === 'video');
            sender.replaceTrack(screenTrack);
        }

        // Mostrar también la pantalla compartida localmente
        localVideo.srcObject = screenStream;
        screenButton.style.backgroundColor = 'green';

        // Cuando termina el compartir pantalla
        screenTrack.onended = async () => {
            const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            const cameraTrack = cameraStream.getVideoTracks()[0];

            for (let id in peers) {
                const sender = peers[id].getSenders().find(s => s.track.kind === 'video');
                sender.replaceTrack(cameraTrack);
            }

            localStream = cameraStream;
            localVideo.srcObject = localStream;
            screenButton.style.backgroundColor = 'white';
        };
    } catch (error) {
        console.error('Error compartiendo pantalla:', error);
    }
});

// Mostrar la fecha y hora de última actualización
if (lastUpdateLabel) {
    const now = new Date();
    lastUpdateLabel.innerText = `Última actualización: ${now.toLocaleString()}`;
}

startCamera();
