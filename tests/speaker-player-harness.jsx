import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { MeetingVideo } from "../src/App.jsx";
function Harness() {
  const mainRef = useRef(null);
  const [media, setMedia] = useState({ pipStatus: "disabled", pipIntervals: [], shareIntervals: [] });
  window.setSpeakerFixture = setMedia;
  window.seekSpeakerFixture = (time) => {
    mainRef.current.currentTime = time;
    mainRef.current.dispatchEvent(new Event("timeupdate"));
  };
  window.pauseSpeakerFixture = () => mainRef.current.pause();
  window.playSpeakerFixture = () => mainRef.current.play();
  return <main style={{ margin: 12, maxWidth: 1000 }}>
    <h1>Actual MeetingVideo camera regression</h1>
    <MeetingVideo videoRef={mainRef} src="/tests/main-fixture.mp4" coverDone coverAt={0.01}
      markers={[]} turns={[]} durationMin={2} meetingId="synthetic" presenterMedia={media} />
    <button style={{ marginTop: 24 }}>Outside player</button>
  </main>;
}
createRoot(document.getElementById("root")).render(<Harness />);
