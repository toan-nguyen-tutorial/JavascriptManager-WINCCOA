'use strict';
const express = require('express');
const { WinccoaManager } = require('winccoa-manager');
const mqtt = require('mqtt');
const path = require('path');
const app = express();
const port = 3000;
const brokerUrl = 'mqtt://192.168.102.248:1883';
const client = mqtt.connect(brokerUrl);
const winccoa = new WinccoaManager();
// Khai báo toàn cục cho datapointGroups
const datapointGroups = {
    "Setpoint1": [
        'Setpoint1.Present_Value',
        'Setpoint1.Object_Identify',
        'Setpoint1.Object_Name'
    ],
    "Setpoint2": [
        'Setpoint2.Present_Value',
        'Setpoint2.Object_Identify',
        'Setpoint2.Object_Name'
    ],
    "Setpoint3": [
        'Setpoint3.Present_Value',
        'Setpoint3.Object_Identify',
        'Setpoint3.Object_Name'
    ],
    "TemperatureIndoor": [
        'TemperatureIndoor.Present_Value',
        'TemperatureIndoor.Object_Identify',
        'TemperatureIndoor.Object_Name'
    ],
    "TemperatureOutdoor": [
        'TemperatureOutdoor.Present_Value',
        'TemperatureOutdoor.Object_Identify',
        'TemperatureOutdoor.Object_Name'
    ],
    "TemperatureWater": [
        'TemperatureWater.Present_Value',
        'TemperatureWater.Object_Identify',
        'TemperatureWater.Object_Name'
    ]
};
// Biến toàn cục để lưu trữ dữ liệu
let jsonData = {};
app.use('/static', express.static(path.join(__dirname, 'public')));
// Kết nối với MQTT broker
client.on('connect', function () {
    //console.log('Connected to MQTT broker');
    setInterval(getValuesAndPublish, 1000);
});
// Hàm lấy giá trị từ WinCC OA và gửi lên MQTT
async function getValuesAndPublish() {
    for (const groupName in datapointGroups) {
        let groupPayload = {};
        const datapointElements = datapointGroups[groupName];

        for (const dpeName of datapointElements) {
            try {
                const value = await winccoa.dpGet(dpeName);
                console.log('Giá trị của ' + dpeName + ' = ' + value);
                groupPayload[dpeName.split('.').pop()] = value;
            } catch (error) {
                console.error('Lỗi khi lấy giá trị từ WinCC OA:', error.message);
            }
        }

        if (Object.keys(groupPayload).length > 0) {
            const topic = `MQTTBACnet/${groupName}`;
            const jsonPayload = JSON.stringify(groupPayload, null, 2);
            client.publish(topic, jsonPayload, { qos: 1 }, (err) => {
                if (err) {
                    console.error('Lỗi khi gửi lên MQTT:', err);
                } else {
                    //console.log(`Đã gửi giá trị của ${groupName} lên MQTT topic ${topic}:`, jsonPayload);
                }
            });
            // Cập nhật dữ liệu vào biến toàn cục
            jsonData[groupName] = groupPayload;
        }
    }
}
// REST API trả về dữ liệu JSON
app.get('/data', async (req, res) => {
    res.json(jsonData);  // Trả về dữ liệu đã lưu trữ
});
// Endpoint mới để trả về dữ liệu JSON theo thời gian thực
app.get('/jsondata', (req, res) => {
    res.json(jsonData);  // Trả về dữ liệu JSON
});
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// Mở cổng cho API
app.listen(port, () => {
    console.log(`API đang chạy tại http://localhost:${port}`);
});
// Xử lý sự kiện khi thoát chương trình
process.on('SIGINT', () => {
    //console.log('Đóng kết nối với WinCC OA và MQTT...');
    winccoa.exit(0);
    client.end();
    process.exit();
});



// ================================================SUBCRIBE=============================================================
const topics = [
    'PLCcontrol/motor1',
    'PLCcontrol/motor2',
    'PLCcontrol/motor3',
    'PLCcontrol/motor4',
    'PLCcontrol/motor5',
    'PLCcontrol/motor6',
    'BACnetSetpoint/Setpoint1',
    'BACnetSetpoint/Setpoint2',
    'BACnetSetpoint/Setpoint3'
];

client.on('connect', () => {
    console.log('Connected to MQTT broker');

    // Đăng ký tất cả các topic
    topics.forEach((topic) => {
        client.subscribe(topic, (err) => {
            if (err) {
                console.error(`Failed to subscribe to topic: ${topic}`, err);
            } else {
                console.log(`Subscribed to topic: ${topic}`);
            }
        });
    });
});

// Lắng nghe các message từ MQTT broker
client.on('message', (topic, message) => {
    if (topic === 'PLCcontrol/motor1') {
        const value = message.toString() === 'true';
        writeDataToDPE('System1:Pump_1.myBool', value);

    } else if (topic === 'BACnetSetpoint/Setpoint1') {
        const value = parseFloat(message.toString());
        writeDataToDPE('System1:Setpoint1.Present_Value', value);

    } else if (topic === 'BACnetSetpoint/Setpoint2') {
        const value = parseFloat(message.toString());
        writeDataToDPE('System1:Setpoint2.Present_Value', value);

    } else if (topic === 'BACnetSetpoint/Setpoint3') {
        const value = parseFloat(message.toString());
        writeDataToDPE('System1:Setpoint3.Present_Value', value);
    }
});

// Hàm ghi dữ liệu vào WinCC OA DPE
function writeDataToDPE(dpeName, newValue) {
    try {
        // Ghi giá trị vào DPE (datapoint)
        winccoa.dpSet(dpeName, newValue, (error) => {
            if (error) {
                console.error("Error writing data:", error);
            } else {
                console.log(`Successfully wrote value ${newValue} to ${dpeName}`);
            }
        });
    } catch (exc) {
        console.error("Exception during write:", exc);
    }
}
