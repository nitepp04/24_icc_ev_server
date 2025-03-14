// 테스트했던 백업코드입니다.
// 아아ㅏ

require('dotenv').config();

const express = require('express');
const { DynamoDBClient, ScanCommand, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const exceljs = require('exceljs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  pingTimeout: 60000,  // ping 타임아웃 설정 (60초)
  pingInterval: 25000,  // ping 간격 설정 (25초)
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ['websocket', 'polling']
});

const port = 2004;  // 서버 포트

// AWS SDK 설정 (자격 증명을 추가합니다)
const dynamoDBClient = new DynamoDBClient({
  region: 'ap-northeast-2',  // 지역 설정
  credentials: {
    accessKeyId: process.env.DYNAMODB_ACCESS_KEY,  // 여기에 AWS 액세스 키 입력
    secretAccessKey: process.env.DYNAMODB_SECRET_ACCESS_KEY // 여기에 AWS 비밀 키 입력
  }
});

app.use(cors());
app.use(express.json());

function getKoreaTime() {
  const now = new Date();
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000); // UTC 시간으로 변환
  const koreaTime = new Date(utcTime + (9 * 60 * 60000)); // 한국 시간(UTC+9)으로 변환
  return koreaTime.toISOString(); // ISO 문자열로 변환
}

// DynamoDB에 데이터를 저장하는 함수
async function saveToDynamoDB(data) {
  const params = {
    TableName: '24_icc_ev_database',  // DynamoDB 테이블 이름
    Item: {
      "timestamp": { S: getKoreaTime() },  // 한국 시간으로 타임스탬프 설정
      "RPM": { N: String(data.RPM) },
      "MOTOR_CURRENT": { N: String(data.MOTOR_CURRENT) },
      "BATTERY_VOLTAGE": { N: String(data.BATTERY_VOLTAGE) },
      "THROTTLE_SIGNAL": { N: String(data.THROTTLE_SIGNAL) },
      "CONTROLLER_TEMPERATURE": { N: String(data.CONTROLLER_TEMPERATURE) },
      "RTC": { N: String(data.RTC) },
      "PCB_TEMP": { N: String(data.PCB_TEMP) }
    }
  };

  try {
    const command = new PutItemCommand(params);
    await dynamoDBClient.send(command);
    console.log('DynamoDB에 성공적으로 저장되었습니다:', data);
  } catch (err) {
    console.error('DynamoDB 저장 중 오류 발생:', err);
  }
}

// DynamoDB에서 날짜 범위로 데이터 조회
async function scanDynamoDB(startDate, endDate) {
  const params = {
    TableName: '24_icc_ev_database',
    FilterExpression: "#timestamp between :start and :end",
    ExpressionAttributeNames: {
      "#timestamp": "timestamp"
    },
    ExpressionAttributeValues: {
      ":start": { S: new Date(startDate).toISOString() },
      ":end": { S: new Date(endDate).toISOString() }
    }
  };

  try {
    const command = new ScanCommand(params);
    const data = await dynamoDBClient.send(command);
    
    return data.Items.map(item => ({
      timestamp: item.timestamp.S,
      RPM: item.RPM.N,
      MOTOR_CURRENT: item.MOTOR_CURRENT.N,
      BATTERY_VOLTAGE: item.BATTERY_VOLTAGE.N,
      THROTTLE_SIGNAL: item.THROTTLE_SIGNAL.N,
      CONTROLLER_TEMPERATURE: item.CONTROLLER_TEMPERATURE.N,
      RTC: item.RTC.N,
      PCB_TEMP: item.PCB_TEMP.N
    }));
  } catch (err) {
    console.error('DynamoDB 조회 중 오류 발생:', err);
    throw err;
  }
}

// 데이터를 Excel 파일로 변환
async function generateExcel(data) {
  const workbook = new exceljs.Workbook();
  const worksheet = workbook.addWorksheet('ICC EV Data');

  worksheet.columns = [
    { header: 'Timestamp', key: 'timestamp', width: 25 },
    { header: 'RPM', key: 'RPM', width: 15 },
    { header: 'Motor Current', key: 'MOTOR_CURRENT', width: 20 },
    { header: 'Battery Voltage', key: 'BATTERY_VOLTAGE', width: 20 },
    { header: 'Throttle Signal', key: 'THROTTLE_SIGNAL', width: 20 },
    { header: 'Controller Temperature', key: 'CONTROLLER_TEMPERATURE', width: 30 },
    { header: 'RTC', key: 'RTC', width: 15 },
    { header: 'PCB Temp', key: 'PCB_TEMP', width: 15 }
  ];

  data.forEach((item) => {
    worksheet.addRow(item);
  });

  return workbook;
}

// 16진수를 거꾸로 배열하고 10진수로 변환하는 함수
function parseData(buffer) {
  const parsedData = {};

  parsedData.RPM = parseInt(buffer.slice(0, 2).reverse().toString('hex'), 16);             // 0~1 바이트 (거꾸로)
  parsedData.MOTOR_CURRENT = parseInt(buffer.slice(2, 4).reverse().toString('hex'), 16);   // 2~3 바이트
  parsedData.BATTERY_VOLTAGE = parseInt(buffer.slice(4, 6).reverse().toString('hex'), 16); // 4~5 바이트
  parsedData.THROTTLE_SIGNAL = parseInt(buffer.slice(6, 8).reverse().toString('hex'), 16); // 6~7 바이트
  parsedData.CONTROLLER_TEMPERATURE = parseInt(buffer.slice(8, 10).reverse().toString('hex'), 16); // 8~9 바이트
  parsedData.SPEED = parseInt(buffer.slice(10, 12).reverse().toString('hex'), 16);         // 10~11 바이트
  parsedData.BATTERY_PERCENT = parseInt(buffer.slice(12, 14).reverse().toString('hex'), 16); // 12~13 바이트

  return parsedData;
}

// 클라이언트로부터 요청 받은 기간 동안의 데이터를 조회하고 Excel로 변환하여 전달하는 엔드포인트
app.post('/export-excel', async (req, res) => {
  const { startDate, endDate } = req.body;  // 클라이언트로부터 시작/종료 날짜를 받음

  try {
    const data = await scanDynamoDB(startDate, endDate);  // DynamoDB에서 데이터 조회

    const workbook = await generateExcel(data);  // Excel 파일 생성

    // 파일 전송
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="data.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('엑셀 파일 생성 중 오류 발생:', error);
    res.status(500).send('엑셀 파일 생성 중 오류가 발생했습니다.');
  }
});

// Socket.IO 연결 이벤트
io.on('connection', (socket) => {
  console.log('사용자 연결됨:', socket.id);

  const dataWithKey = {
    RPM: 2004,
    MOTOR_CURRENT: 2004,
    BATTERY_VOLTAGE: 2004,
    THROTTLE_SIGNAL: 2004,
    CONTROLLER_TEMPERATURE: 2004,
    RTC: 2004,
    PCB_TEMP: 2004
  };
  
  saveToDynamoDB(dataWithKey);
  
  socket.on('error', (err) => {
    console.error('Socket.IO Error:', err);
    socket.emit('error', { message: '서버에서 오류가 발생했습니다.', detail: err.message });
  });

  socket.on('disconnect', (reason) => {
    console.log('사용자 연결 해제됨:', reason);
  });
  
  // 1. 수신된 데이터를 클라이언트에 즉시 전송
  socket.emit('dataReceived', dataWithKey);
  
  // ESP32에서 데이터 수신 및 처리
  socket.on('sendData', (receivedData) => {
    try {
      // receivedData가 28자리의 16진수 배열로 들어온다고 가정
      const buffer = Buffer.from(receivedData, 'hex'); // receivedData를 Buffer로 변환 (16진수)
      
      // 데이터를 파싱하여 10진수로 변환
      const parsedData = parseData(buffer);
  
      // 파싱된 데이터 출력
      console.log('Parsed Data:', parsedData);
  
      const dataWithKey = {
        RPM: parsedData.RPM,
        MOTOR_CURRENT: parsedData.MOTOR_CURRENT,
        BATTERY_VOLTAGE: parsedData.BATTERY_VOLTAGE,
        THROTTLE_SIGNAL: parsedData.THROTTLE_SIGNAL,
        CONTROLLER_TEMPERATURE: parsedData.CONTROLLER_TEMPERATURE,
        SPEED: parsedData.SPEED,
        BATTERY_PERCENT: parsedData.BATTERY_PERCENT
      };
  
      // 1. 수신된 데이터를 클라이언트에 즉시 전송
      socket.emit('dataReceived', dataWithKey);
      
      // 2. 동시에 데이터를 DynamoDB에 저장
      saveToDynamoDB(dataWithKey);
  
    } catch (error) {
      console.error('데이터 처리 중 오류 발생:', error);
      socket.emit('error', { message: '데이터 처리 중 오류 발생', detail: error.message });
    }
  });  
});

// 서버 시작
server.listen(port, () => {
  console.log(`${port} 포트에서 서버가 시작되었습니다.`);
});
