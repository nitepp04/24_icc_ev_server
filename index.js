// 귀찮아서 하나에 때려 박음

const ip = require('ip');
const express = require('express');
const cors = require('cors');
const http = require('http');

const { parseData, getKoreaTime } = require('./src/utils/Utils.js');
const { saveToDynamoDB, scanDynamoDB } = require('./src/services/dynamoDBService.js')
const { PORT } = require('./src/config/envConfig.js');
const { createSocketServer } = require('./src/config/socketConfig.js');
const { initSocket } = require('./src/services/socketService.js');

// express 서버 생성
const app = express();
const server = http.createServer(app);

// cors 및 json 파싱 미들웨어 추가
app.use(cors());
app.use(express.json());

// socket.io 서버 생성 및 이벤트 핸들러 설정
const io = createSocketServer(server);
initSocket(io);


// 서버 시작
server.listen(PORT, () => {
  console.log(`${PORT} 포트에서 서버가 시작되었습니다.`);
  console.log(getKoreaTime());
});
