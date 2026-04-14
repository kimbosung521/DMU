import React, { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, runTransaction } from "firebase/database";
import "./App.css";
import QUIZ_BANK from "./question.json";
import dmuChar from "./dmuChar2.png";
import dmuLogo from "./dmuLogo2.png";

// --- Firebase 설정 ---dd
// 주의: .env 파일에 아래 변수들이 잘 들어있는지 꼭 확인하세요!
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  // 👇 아시아(싱가포르) 리전을 선택하셨으므로 databaseURL이 반드시 필요합니다!
  databaseURL: process.env.REACT_APP_FIREBASE_URL,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
};

let db = null;
try {
  const app = initializeApp(firebaseConfig);
  db = getDatabase(app);
} catch (e) {
  console.warn("Firebase 초기화 실패", e);
}

const QUESTIONS_PER_ROUND = 5;
const MC_COUNT = 2;
const OX_COUNT = 2;
const PARTICIPANT_COUNT_KEY_PREFIX = "quiz_participated";

// 배열 셔플용 유틸 함수
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const getTodayParticipantKey = () => {
  const today = new Date().toISOString().slice(0, 10);
  return `${PARTICIPANT_COUNT_KEY_PREFIX}_${today}`;
};

function App() {
  const [gameState, setGameState] = useState("START"); // START, QUIZ, RESULT
  const [currentQuestions, setCurrentQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [selectedVal, setSelectedVal] = useState(null);
  const [userAnswers, setUserAnswers] = useState([]);
  const [participantsCount, setParticipantsCount] = useState(0);

  // 1. 총 참여자 수 실시간으로 불러오기
  useEffect(() => {
    if (db) {
      const countRef = ref(db, "total_participants");
      const unsubscribe = onValue(countRef, (snapshot) => {
        setParticipantsCount(snapshot.val() || 0);
      });
      return () => unsubscribe();
    }
  }, []);

  // 2. 퀴즈 시작 (여기서는 참여자 수를 올리지 않습니다)
  const startQuiz = async () => {
    const mc = QUIZ_BANK.filter((q) => q.type === "mc");
    const ox = QUIZ_BANK.filter((q) => q.type === "ox");
    const hardPool = QUIZ_BANK.filter(
      (q) => (q.type === "mc" || q.type === "ox") && q.difficulty === "hard",
    );

    const hardQuestion = shuffle(hardPool)[0] || null;
    const picked = [];

    if (hardQuestion) {
      picked.push(hardQuestion);
    }

    const mcCandidates = hardQuestion
      ? mc.filter((q) => q !== hardQuestion)
      : mc;
    const oxCandidates = hardQuestion
      ? ox.filter((q) => q !== hardQuestion)
      : ox;

    picked.push(...shuffle(mcCandidates).slice(0, MC_COUNT));
    picked.push(...shuffle(oxCandidates).slice(0, OX_COUNT));

    if (picked.length < QUESTIONS_PER_ROUND) {
      const usedSet = new Set(picked);
      const remainPool = shuffle([...mc, ...ox].filter((q) => !usedSet.has(q)));
      picked.push(...remainPool.slice(0, QUESTIONS_PER_ROUND - picked.length));
    }

    const finalPicked = shuffle(picked).slice(0, QUESTIONS_PER_ROUND);

    setCurrentQuestions(finalPicked);
    setCurrentIndex(0);
    setScore(0);
    setUserAnswers([]);
    setAnswered(false);
    setSelectedVal(null);
    setGameState("QUIZ");
  };

  // 3. 정답 선택 로직
  const handleSelectAnswer = (selected) => {
    if (answered) return;
    setAnswered(true);
    setSelectedVal(selected);

    const q = currentQuestions[currentIndex];
    const isCorrect = selected === q.answer;

    if (isCorrect) setScore((prev) => prev + 1);

    setUserAnswers((prev) => [
      ...prev,
      { question: q.question, correct: isCorrect },
    ]);
  };

  // 4. 다음 문제 또는 결과 화면으로 이동
  const nextQuestion = () => {
    if (currentIndex < currentQuestions.length - 1) {
      // 다음 문제로 넘어갈 때
      setCurrentIndex((prev) => prev + 1);
      setAnswered(false);
      setSelectedVal(null);
    } else {
      // 🌟 마지막 문제를 풀고 결과 화면으로 넘어갈 때 참여자 수 +1
      setGameState("RESULT");

      const todayKey = getTodayParticipantKey();
      const alreadyCountedToday = localStorage.getItem(todayKey) === "1";

      if (db && !alreadyCountedToday) {
        const countRef = ref(db, "total_participants");
        runTransaction(countRef, (currentCount) => {
          return (currentCount || 0) + 1;
        })
          .then((result) => {
            if (result.committed) {
              localStorage.setItem(todayKey, "1");
            }
          })
          .catch((e) => console.warn("카운트 업데이트 실패:", e));
      }
    }
  };

  // --- 화면 렌더링 함수들 ---
  const renderStart = () => (
    <>
      <div className="start-icon">
        <img src={dmuChar} style={{ width: "80px", height: "80px" }} />
      </div>
      <div className="start-title">취업 상식 퀴즈</div>
      <div className="start-sub">취업지원센터에서 준비한 특별 퀴즈!</div>
      <button className="btn-start" onClick={startQuiz}>
        퀴즈 시작하기
      </button>
    </>
  );

  const renderQuiz = () => {
    const q = currentQuestions[currentIndex];
    const isCorrect = selectedVal === q.answer;

    return (
      <>
        <div className="quiz-header">
          <span className="quiz-count">
            <strong>{currentIndex + 1}</strong> / {currentQuestions.length}
          </span>
          <span
            className={`quiz-type-badge ${q.type === "mc" ? "badge-mc" : "badge-ox"}`}
          >
            {q.type === "mc" ? "사지선다" : "O / X"}
          </span>
        </div>

        <div className="quiz-question">{q.question}</div>

        {q.type === "mc" ? (
          <div className="options-grid mc">
            {q.options.map((opt, i) => {
              let btnClass = "option-btn";
              if (answered) {
                if (i === q.answer) btnClass += " correct";
                else if (i === selectedVal) btnClass += " wrong";
              }
              return (
                <button
                  key={i}
                  className={btnClass}
                  onClick={() => handleSelectAnswer(i)}
                  disabled={answered}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="options-grid ox">
            {["O", "X"].map((label, i) => {
              const val = label === "O" ? true : false;
              let btnClass = "option-btn ox-btn";
              if (answered) {
                if (val === q.answer) btnClass += " correct";
                else if (val === selectedVal) btnClass += " wrong";
              }
              return (
                <button
                  key={i}
                  className={btnClass}
                  onClick={() => handleSelectAnswer(val)}
                  disabled={answered}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {answered && (
          <div id="feedback">
            <div
              className={`feedback-box ${isCorrect ? "correct-fb" : "wrong-fb"}`}
            >
              {isCorrect ? "✅ 정답입니다!" : "❌ 오답입니다!"}
              <br />
              {q.explanation}
            </div>
            <button className="btn-next" onClick={nextQuestion}>
              {currentIndex < currentQuestions.length - 1
                ? "다음 문제 →"
                : "결과 보기 →"}
            </button>
          </div>
        )}
      </>
    );
  };

  const renderResult = () => {
    const passed = score >= 3;

    return (
      <>
        <div
          className="result-score-ring"
          style={{
            background: "#f0fdf4",
            border: "4px solid #22c55e",
            color: "#166534",
          }}
        >
          <div className="score-num">{score}</div>
          <div className="score-denom">/ {QUESTIONS_PER_ROUND} 맞음</div>
        </div>

        <div className="result-msg">
          {passed ? (
            <>
              3개 이상 정답입니다!
              <br />
              취업지원센터 부스로 오셔서
              <br />
              도장을 받아가세요
            </>
          ) : (
            <>아쉽지만, 다시 도전해 보시겠어요?</>
          )}
        </div>
        <button className="btn-retry" onClick={() => setGameState("START")}>
          처음으로 돌아가기
        </button>
      </>
    );
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        // background: 'linear-gradient(160deg, #1a3a6b 0%, #0f2447 50%, #0a1a35 100%)',
        backgroundColor: "#2e4893",
        padding: "24px",
      }}
    >
      <div className="school-badge">
        <img src={dmuLogo} style={{ width: "45px", height: "25px" }} />
        <div
          style={{ fontWeight: "600", fontSize: "15px", marginLeft: "-5px" }}
        >
          취업지원센터
        </div>
      </div>

      <div className="card">
        {gameState === "START" && renderStart()}
        {gameState === "QUIZ" && renderQuiz()}
        {gameState === "RESULT" && renderResult()}
      </div>

      <div
        className="total-counter"
        style={{
          marginTop: "20px",
          color: "rgba(255,255,255,0.7)",
          fontSize: "14px",
          fontWeight: "bold",
        }}
      >
        {participantsCount > 0
          ? `오늘 총 ${participantsCount.toLocaleString()}명 참여 완료! 🎉`
          : ""}
      </div>
    </div>
  );
}

export default App;
