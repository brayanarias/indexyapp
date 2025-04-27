const localVideo = document.getElementById('localVideo');
const remoteVideosContainer = document.getElementById('remoteVideosContainer');
const cameraButton = document.getElementById('cameraButton');
const micButton = document.getElementById('micButton');
const screenButton = document.getElementById('screenButton');

let localStream;
let peers = {};
let miId = null;
let socket = new WebSocket('wss://servidor-senalizacion-production.up.railway.app');

socket.addEventListener('open', () => {
    console.log('Conectado al servidor de señalización');
    socket.send(JSON.stringify({ type: 'new-user' })); // AVISA QUE ERES UN NUEVO USUARIO
});

socket.addEventListener('message', async event => {
    const data = JSON.parse(event.data);

    if (data.type === 'id') {
        miId = data.id;
        console.log('Tu ID es:', miId);
    } else if (data.type === 'new-user') {
        console.log('Nuevo usuario conectado:', data.id);
        callUser(data.id); // AUTOMÁTICAMENTE LLAMAS AL NUEVO
    } else if (data.type === 'offer') {
        const peerConnection = createPeerConnection(data.from);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        socket.send(JSON.stringify({ type: 'answer', answer: answer, to: data.from }));
    } else if (data.type === 'answer') {
        if (peers[data.from]) {
            await peers[data.from].setRemoteDescription(new RTCSessionDescription(data.answer));
        }
    } else if (data.type === 'candidate') {
        if (peers[data.from]) {
            await peers[data.from].addIceCandidate(new RTCIceCandidate(data.candidate));
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

    socket.send(JSON.stringify({ type: 'offer', offer: offer, to: id }));
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
