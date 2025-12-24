const texts = [
    "Hello, this is the first sentence.",
    "This is the second line of text.",
    "Finally, this is the third one."
];

let textIndex = 0;
let charIndex = 0;
let isDeleting = false;

const textElement = document.getElementById("text");
const cursorElement = document.getElementById("cursor");

// 速度参数
const TYPE_SPEED = 120;
const DELETE_SPEED = 80;
const HOLD_AFTER_TYPE = 1000;
const HOLD_AFTER_DELETE = 400;

// 光标闪烁控制
let cursorTimer = null;
let cursorVisible = true;

function showCursor() {
    cursorElement.style.visibility = "visible";
    cursorVisible = true;
}

function hideCursor() {
    cursorElement.style.visibility = "hidden";
    cursorVisible = false;
}

function startCursorBlink() {
    if (cursorTimer) return;

    cursorTimer = setInterval(() => {
        cursorVisible ? hideCursor() : showCursor();
    }, 500);
}

function stopCursorBlink() {
    if (!cursorTimer) return;

    clearInterval(cursorTimer);
    cursorTimer = null;
    showCursor(); // 输入时光标常亮
}

// 主打字逻辑
function typeLoop() {
    const currentText = texts[textIndex];

    // 输入或删除中：不闪烁
    stopCursorBlink();

    if (!isDeleting) {
        textElement.textContent = currentText.slice(0, charIndex);
        charIndex++;

        if (charIndex > currentText.length) {
            // 打完，进入空闲
            startCursorBlink();
            setTimeout(() => isDeleting = true, HOLD_AFTER_TYPE);
        }
    } else {
        charIndex--;
        textElement.textContent = currentText.slice(0, charIndex);

        if (charIndex === 0) {
            isDeleting = false;
            textIndex = (textIndex + 1) % texts.length;
            startCursorBlink();
            setTimeout(() => { }, HOLD_AFTER_DELETE);
        }
    }

    setTimeout(typeLoop, isDeleting ? DELETE_SPEED : TYPE_SPEED);
}

// 初始状态：空闲，光标闪
startCursorBlink();
typeLoop();
