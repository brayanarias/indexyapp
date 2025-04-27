const socket = new WebSocket('wss://servidor-senalizacion-production.up.railway.app');

let localStream;
let remoteStream;
let peerConnection;
const config = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ]
};

socket.onopen = () => {
  console.log('Conectado al servidor de señalización');
};

socket.onmessage = (message) => {
  const data = JSON.parse(message.data);

  if (data.type === 'your-id') {
    console.log('Tu ID es:', data.id);
    window.myID = data.id; // Guardamos nuestro propio ID
  } else if (data.type === 'offer') {
    handleOffer(data.offer, data.from);
  } else if (data.type === 'answer') {
    handleAnswer(data.answer);
  } else if (data.type === 'candidate') {
    if (peerConnection) {
      peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  }
};

async function startCamera() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    document.querySelector('video').srcObject = localStream;
  } catch (error) {
    console.error('Error accediendo a la cámara/micrófono:', error);
  }
}

function createPeerConnection(otherUserId) {
  peerConnection = new RTCPeerConnection(config);

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.send(JSON.stringify({
        type: 'candidate',
        candidate: event.candidate,
        to: otherUserId
      }));
    }
  };

  peerConnection.ontrack = (event) => {
    if (!remoteStream) {
      remoteStream = new MediaStream();
      const remoteVideo = document.createElement('video');
      remoteVideo.autoplay = true;
      remoteVideo.playsInline = true;
      remoteVideo.srcObject = remoteStream;
      document.body.appendChild(remoteVideo);
    }
    remoteStream.addTrack(event.track);
  };

  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });
}

async function callUser(otherUserId) {
  createPeerConnection(otherUserId);

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  socket.send(JSON.stringify({
    type: 'offer',
    offer: offer,
    to: otherUserId
  }));
}

async function handleOffer(offer, from) {
  createPeerConnection(from);

  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  socket.send(JSON.stringify({
    type: 'answer',
    answer: answer,
    to: from
  }));
}

async function handleAnswer(answer) {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
}

// Botones de interfaz
document.getElementById('toggleCamera').addEventListener('click', async () => {
  if (!localStream) {
    await startCamera();
  } else {
    const videoTrack = localStream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;
  }
});

document.getElementById('toggleMicrophone').addEventListener('click', async () => {
  if (!localStream) {
    await startCamera();
  } else {
    const audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
  }
});

document.getElementById('shareScreen').addEventListener('click', async () => {
  try {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const screenTrack = screenStream.getVideoTracks()[0];

    const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
    sender.replaceTrack(screenTrack);

    screenTrack.onended = async () => {
      const videoTrack = localStream.getVideoTracks()[0];
      sender.replaceTrack(videoTrack);
    };
  } catch (error) {
    console.error('Error compartiendo pantalla:', error);
  }
});
