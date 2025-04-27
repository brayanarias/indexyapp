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
        localStorage.setItem('userID', data.id);  // Guardamos nuestro ID
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
        removePeer(data.id);
    }
});

function createPeerConnection(id) {
    const peerConnection = new RTCPeerConnection();

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    peerConnection.ontrack = event => {
        const remoteVideoWrapper = document.createElement('div');
        remoteVideoWrapper.style.position = 'relative';
        remoteVideoWrapper.style.display = 'inline-block';
        remoteVideoWrapper.style.margin = '10px';

        const remoteVideo = document.createElement('video');
        remoteVideo.srcObject = event.streams[0];
        remoteVideo.autoplay = true;
        remoteVideo.playsInline = true;
        remoteVideo.style.width = '300px';
        remoteVideo.style.height = '300px';
        remoteVideo.style.border = '2px solid green';
        remoteVideo.style.borderRadius = '10px';
        remoteVideoWrapper.appendChild(remoteVideo);

        const fullscreenButton = document.createElement('button');
        fullscreenButton.innerText = '🔍';
        fullscreenButton.style.position = 'absolute';
        fullscreenButton.style.top = '5px';
        fullscreenButton.style.right = '5px';
        fullscreenButton.style.background = 'rgba(0, 0, 0, 0.5)';
        fullscreenButton.style.color = 'white';
        fullscreenButton.style.border = 'none';
        fullscreenButton.style.borderRadius = '50%';
        fullscreenButton.style.width = '30px';
        fullscreenButton.style.height = '30px';
        fullscreenButton.style.cursor = 'pointer';

        fullscreenButton.onclick = () => {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                remoteVideo.requestFullscreen().catch(err => {
                    console.error('Error al intentar pantalla completa:', err);
                });
            }
        };

        remoteVideoWrapper.appendChild(fullscreenButton);
        remoteVideosContainer.appendChild(remoteVideoWrapper);
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
        localStream.getVideoTracks()[0].enabled = !localStream.getVideoTracks()[0].enabled;
    }
});

micButton.addEventListener('click', () => {
    if (localStream) {
        localStream.getAudioTracks()[0].enabled = !localStream.getAudioTracks()[0].enabled;
    }
});

screenButton.addEventListener('click', async () => {
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];

        // Cambiar en conexiones
        for (let id in peers) {
            const sender = peers[id].getSenders().find(s => s.track.kind === 'video');
            if (sender) {
                sender.replaceTrack(screenTrack);
            }
        }

        // Mostrar vista propia de la pantalla compartida
        const localScreenWrapper = document.createElement('div');
        localScreenWrapper.style.position = 'relative';
        localScreenWrapper.style.display = 'inline-block';
        localScreenWrapper.style.margin = '10px';

        const localScreenVideo = document.createElement('video');
        localScreenVideo.srcObject = screenStream;
        localScreenVideo.autoplay = true;
        localScreenVideo.playsInline = true;
        localScreenVideo.muted = true; // No queremos eco
        localScreenVideo.style.width = '300px';
        localScreenVideo.style.height = '300px';
        localScreenVideo.style.border = '2px dashed blue';
        localScreenVideo.style.borderRadius = '10px';

        localScreenWrapper.appendChild(localScreenVideo);
        remoteVideosContainer.appendChild(localScreenWrapper);

        screenTrack.onended = async () => {
            const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
            const cameraTrack = cameraStream.getVideoTracks()[0];

            for (let id in peers) {
                const sender = peers[id].getSenders().find(s => s.track.kind === 'video');
                if (sender) {
                    sender.replaceTrack(cameraTrack);
                }
            }

            // Eliminar la miniatura cuando deje de compartir pantalla
            remoteVideosContainer.removeChild(localScreenWrapper);
        };
    } catch (error) {
        console.error('Error compartiendo pantalla:', error);
    }
});


function removePeer(id) {
    if (peers[id]) {
        peers[id].close();
        delete peers[id];
    }
    const videoElement = document.getElementById(`remote-${id}`);
    if (videoElement) {
        videoElement.remove();
    }
}

// Informar cuando el usuario se va
window.addEventListener('beforeunload', () => {
    const userID = localStorage.getItem('userID');
    if (userID) {
        socket.send(JSON.stringify({ type: 'user-disconnected', id: userID }));
    }
});

startCamera();

// Permitir ampliar cualquier video remoto a pantalla completa con doble clic
remoteVideosContainer.addEventListener('dblclick', event => {
    if (event.target.tagName === 'VIDEO') {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            event.target.requestFullscreen().catch(err => {
                console.error('Error al intentar pantalla completa:', err);
            });
        }
    }
});

