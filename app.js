const localVideo = document.getElementById('localVideo');
const remoteVideosContainer = document.getElementById('remoteVideosContainer');
const cameraButton = document.getElementById('cameraButton');
const micButton = document.getElementById('micButton');
const screenButton = document.getElementById('screenButton');

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
        const videoToRemove = document.getElementById(`video-${data.id}`);
        if (videoToRemove) {
            videoToRemove.remove();
        }
        delete peers[data.id];
    }
});

function createPeerConnection(id) {
    const peerConnection = new RTCPeerConnection();

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    peerConnection.ontrack = event => {
        const remoteVideo = document.createElement('video');
        remoteVideo.id = `video-${id}`; // Identificador único para cada video
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

cameraButton.addEventListener('click', () => {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        videoTrack.enabled = !videoTrack.enabled;
    }
});

micButton.addEventListener('click', () => {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        audioTrack.enabled = !audioTrack.enabled;
    }
});

screenButton.addEventListener('click', async () => {
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];

        for (let id in peers) {
            const sender = peers[id].getSenders().find(s => s.track.kind === 'video');
            if (sender) {
                sender.replaceTrack(screenTrack);
            }
        }

        screenTrack.onended = async () => {
            const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
            const cameraTrack = cameraStream.getVideoTracks()[0];

            for (let id in peers) {
                const sender = peers[id].getSenders().find(s => s.track.kind === 'video');
                if (sender) {
                    sender.replaceTrack(cameraTrack);
                }
            }
        };
    } catch (error) {
        console.error('Error compartiendo pantalla:', error);
    }
});

startCamera();

// Fecha y hora de última actualización
const fechaActualizacion = document.createElement('div');
fechaActualizacion.style.position = 'fixed';
fechaActualizacion.style.bottom = '5px';
fechaActualizacion.style.right = '5px';
fechaActualizacion.style.backgroundColor = 'rgba(0,0,0,0.5)';
fechaActualizacion.style.color = 'white';
fechaActualizacion.style.padding = '4px 8px';
fechaActualizacion.style.fontSize = '12px';
fechaActualizacion.style.borderRadius = '4px';
fechaActualizacion.innerText = 'Actualizado: ' + new Date().toLocaleString();
document.body.appendChild(fechaActualizacion);
