// Set constraints for the video stream
var constraints = { video: { facingMode: "user" }, audio: false };

//current state for webpage receiving
//	0: logged in, 1: stream requested, 2: stream active
var currentState;

// Define constant links to document components
//	text
const textClientIP = document.querySelector("#textClientIP")
const textHostIP = document.querySelector("#textHostIP")
//	action buttons
const buttonConnect = document.querySelector("#buttonConnect")
const buttonDisconnect = document.querySelector("#buttonDisconnect")
const buttonSnapshot = document.querySelector("#buttonSnapshot")
//	views
const blockLoading = document.querySelector("#loadingBlock")
const blockCamera = document.querySelector("#cameraBlock")
const cameraView = document.querySelector("#cameraVideo")
const cameraOutput = document.querySelector("#cameraOutput")
const cameraSensor = document.querySelector("#cameraCanvas")
//	basic transmissions
var xhr;
var startTime;
var mediaConstraints = {audio: true, video: true};
const offerOptions = { offerToReceiveAudio: 1, offerToReceiveVideo: 1 };
//	connections
var localConnection = null;   // RTCPeerConnection for our "local" connection
var remoteConnection = null;  // RTCPeerConnection for the "remote"
//	data channels
var sendChannel = null;       // RTCDataChannel for the local (sender)
var receiveChannel = null;    // RTCDataChannel for the remote (receiver)

function getName(pc) { return (pc === localConnection) ? 'localConnection' : 'remoteConnection'; } 
function getOtherPc(pc) { return (pc === localConnection) ? remoteConnection : localConnection; }

//listener - META DATA
cameraVideo.addEventListener('loadedmetadata', function() 
	{
	  console.log(`Remote video videoWidth: ${this.videoWidth}px,  videoHeight: ${this.videoHeight}px`);
	});
//listener - RESIZE
cameraVideo.addEventListener('resize', () => 
	{
		console.log(`Remote video size changed to ${remoteVideo.videoWidth}x${remoteVideo.videoHeight}`);
		// We'll use the first onsize callback as an indication that video has started
		// playing out.
		if (startTime) 
		{
			const elapsedTime = window.performance.now() - startTime;
			console.log('Setup time: ' + elapsedTime.toFixed(3) + 'ms');
			startTime = null;
		}
	});

//used to initialize the webpage's entry state
function initialize() 
{
        console.debug("initializing...");
	currentState = 0;
	
	//set default view state
	blockLoading.style.display = "none";
	blockCamera.style.display = "none";
	
	textHostIP.innerHTML = "stream disabled";
	
	console.debug("initialization complete");
}

//attempts a connection to the device's camera and begins the stream
function connectionAttempt()
{
	//if logged in
	if(currentState == 0)
	{
		//request stream from connected doorbell
        	console.debug("requesting stream...");
		textHostIP.innerHTML = "stream pending...";
		currentState = 1;
		
		blockLoading.style.display = "block";
		blockCamera.style.display = "none";
		
		//create a connection request
		xhr = new XMLHttpRequest();
		xhr.open('GET', "./-IP:"+textClientIP.innerHTML+"-START", true);
 		xhr.setRequestHeader("Cache-Control", "no-store");
		xhr.send();
		
		xhr.addEventListener("readystatechange", connectionProcess, false);
	}
	//if still waiting for a stream request to resolve
	if(currentState == 1)
   	{
        	console.debug("stream request being processed...");
   	}
	//if stream is already active
	else
	{
        	console.debug("stream already active");
	}
}

//processes returning connection details
async function connectionProcess(e)
{
	//check ready-state change type and success
	if(xhr.readyState == 4 && xhr.status == 200)
   	{
        	console.debug("successfully established connection");
		textHostIP.innerHTML = xhr.responseText;
		currentState = 2;
	 
		startTime = window.performance.now();
		const configuration = {};

		//set up connections
		//	local
		localConnection = new RTCPeerConnection(configuration);
		localConnection.addEventListener('icecandidate', e => onIceCandidate(localConnection, e));
		localConnection.addEventListener('iceconnectionstatechange', e => onIceStateChange(localConnection, e));
		//	remote
		remoteConnection = new RTCPeerConnection(configuration);
		remoteConnection.addEventListener('icecandidate', e => onIceCandidate(remoteConnection, e));
		remoteConnection.addEventListener('iceconnectionstatechange', e => onIceStateChange(remoteConnection, e));
		
		remoteConnection.addEventListener('track', gotRemoteStream);

		//attmpet stream offer
		try 
		{
			console.debug('local connection createOffer start');
			const offer = await localConnection.createOffer(offerOptions);
			await onCreateOfferSuccess(offer);
		} 
		catch (e) 
		{
			onCreateSessionDescriptionError(e);
		}
   	}
	//if ready-state is finished but failed to aquire, disconnect
	else if(xhr.readyState == 4)
	{
        	console.debug("failed to establish connection");
		connectionDisconnect();
	}
}

//creation of session failed
function onCreateSessionDescriptionError(error) 
{
	console.log(`Failed to create session description: ${error.toString()}`);
}
//offer was successfully created
async function onCreateOfferSuccess(desc) 
{
	console.debug(`Offer from localConnection\n${desc.sdp}`);
	//set up the local start
	console.debug('localConnection setLocalDescription start');
	try
	{
		await localConnection.setLocalDescription(desc);
		onSetLocalSuccess(localConnection);
	} 
	catch (e) { onSetSessionDescriptionError(); }

	//set up the remote start
	console.debug('remoteConnection setRemoteDescription start');
	try 
	{
		await remoteConnection.setRemoteDescription(desc);
		onSetRemoteSuccess(remoteConnection);
	} 
	catch (e) { onSetSessionDescriptionError(); }

	console.debug('remoteConnection createAnswer start');
	// Since the 'remote' side has no media stream we need
	// to pass in the right constraints in order for it to
	// accept the incoming offer of audio and video.
	try 
	{
		const answer = await remoteConnection.createAnswer();
		await onCreateAnswerSuccess(answer);
	} 
	catch (e) { onCreateSessionDescriptionError(e); }
}
//verbose logging
function onSetLocalSuccess(pc) { console.log(`${getName(pc)} setLocalDescription complete`); }
function onSetRemoteSuccess(pc) { console.log(`${getName(pc)} setRemoteDescription complete`); }
function onSetSessionDescriptionError(error)  { console.log(`Failed to set session description: ${error.toString()}`); }

//found a remote stream
function gotRemoteStream(e) 
{
	if (remoteVideo.srcObject !== e.streams[0]) 
	{
		remoteVideo.srcObject = e.streams[0];
		console.log('remoteConnection received remote stream');
	}
}

//successfully answered as received call (remote connection's side)
async function onCreateAnswerSuccess(desc) 
{
	console.log(`Answer from remoteConnection:\n${desc.sdp}`);
	//remote start
	console.log('remoteConnection setLocalDescription start');
	try 
	{
		await remoteConnection.setLocalDescription(desc);
		onSetLocalSuccess(remoteConnection);
	} 
	catch (e) { onSetSessionDescriptionError(e); }
	
	//local start
	console.log('localConnection setRemoteDescription start');
	try 
	{
		await localConnection.setRemoteDescription(desc);
		onSetRemoteSuccess(localConnection);
	} 
	catch (e) { onSetSessionDescriptionError(e); }
}

//icy
async function onIceCandidate(pc, event) 
{
	try 
	{
		await (getOtherPc(pc).addIceCandidate(event.candidate));
		onAddIceCandidateSuccess(pc);
	}
	catch (e) { onAddIceCandidateError(pc, e); }
	console.log(`${getName(pc)} ICE candidate:\n${event.candidate ? event.candidate.candidate : '(null)'}`);
}

//verbose logging
function onAddIceCandidateSuccess(pc) { console.log(`${getName(pc)} addIceCandidate success`); }
function onAddIceCandidateError(pc, error) { console.log(`${getName(pc)} failed to add ICE Candidate: ${error.toString()}`); }
function onIceStateChange(pc, event) 
	{ if (pc) { console.log(`${getName(pc)} ICE state: ${pc.iceConnectionState}`); console.log('ICE state change event: ', event); } }

//ends any pending or existing connection
function connectionDisconnect()
{
	console.debug("connection closed");
	currentState = 0;
	textHostIP.innerHTML = "stream disabled";
	
	blockLoading.style.display = "none";
	blockCamera.style.display = "none";
		
	//close connections
	localConnection.close();
	localConnection = null;
	remoteConnection.close();
	remoteConnection = null;
	
	//create a connection request
	xhr = new XMLHttpRequest();
	xhr.open('GET', "./-IP:"+textClientIP.innerHTML+"-DISCONNECT", true);
	xhr.setRequestHeader("Cache-Control", "no-store");
	xhr.send();

	//xhr.addEventListener("readystatechange", connectionProcess, false);
}

//set up button functionality
buttonDisconnect.onclick = function() { connectionDisconnect() };
buttonConnect.onclick = function() { connectionAttempt() };
// Take a picture when picture button is tapped
buttonSnapshot.onclick = function() 
{
	console.debug("taking snapshot...");
	
	cameraSensor.width = cameraView.videoWidth;
	cameraSensor.height = cameraView.videoHeight;
	cameraSensor.getContext("2d").drawImage(cameraView, 0, 0);
	cameraOutput.src = cameraSensor.toDataURL("image/webp");
	cameraOutput.classList.add("taken");
	
	console.debug("snapshot saved");
};

//sets initializer to activate when the webpage loads
window.addEventListener("load", initialize, false);
