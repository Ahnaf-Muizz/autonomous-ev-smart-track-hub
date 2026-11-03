import { GatePartId, GatePartSpec } from '../types';

export const GATE_PARTS: Record<GatePartId, GatePartSpec> = {
  esp32: {
    id: 'esp32',
    number: 1,
    name: 'ESP32 Dual-Core Microcontroller',
    shortTitle: 'ESP32 Brain',
    category: 'Master Compute',
    pinout: 'Xtensa Dual-Core 32-bit @ 240 MHz · FreeRTOS',
    tagPosition: { x: 50, y: 38 },
    summary: 'The 240 MHz computer brain running the station and wireless link.',
    kidExplanation:
      'The gate’s supercharged computer chip with two separate brain cores running at 240 MHz! One core streams wireless race data to the laptop, while the other core tracks the car and swings the gate arms.',
    howItWorks: [
      'Core 0: Runs WiFi server to send live race stats to your screen.',
      'Core 1: Checks sensors and steers servo motors with zero lag.',
    ],
    firmwareDetails: 'esp32_gate_firmware.ino: Dual-core FreeRTOS multi-tasking.',
    formula: '2 Cores @ 240 MHz = Lightning-Fast Reaction Time!',
    funFact:
      'The ESP32 has more computing power than the computer that guided Apollo 11 to the Moon!',
  },

  servos: {
    id: 'servos',
    number: 2,
    name: 'Dual Gate Servo Motors',
    shortTitle: 'Gate Servos',
    category: 'Robotic Actuators',
    pinout: 'Gate 1 (GPIO 18) · Gate 2 (GPIO 19)',
    tagPosition: { x: 18, y: 48 },
    summary: 'Robotic motors that rotate the barrier arms from 0° closed to 90° open.',
    kidExplanation:
      'Two geared robotic motors that act as physical muscles. When the computer sends a pulse signal, the motors swing the yellow-and-black barrier arms up and down in less than half a second.',
    howItWorks: [
      'Gate 1: Swings up when the rover approaches, then closes behind it.',
      'Gate 2: Locks the car in the charger, then opens for the victory sprint!',
    ],
    firmwareDetails: 'ESP32Servo.h: 50Hz PWM (1000µs = 0° closed, 2000µs = 90° open).',
    formula: 'PWM Signal (1.0ms to 2.0ms) = 0° to 90° Gate Angle',
    funFact:
      'Inside every servo is a tiny angle sensor checking its own position 50 times every second!',
  },

  ultrasonic: {
    id: 'ultrasonic',
    number: 3,
    name: 'Ultrasonic Sensor (HC-SR04)',
    shortTitle: 'Ultrasonic Eyes',
    category: 'Echo Sensing',
    pinout: 'Trig (GPIO 5) · Echo (GPIO 17)',
    tagPosition: { x: 26, y: 22 },
    summary: 'Bounces 40 kHz silent sound waves to measure rover distance in centimeters.',
    kidExplanation:
      'Like a robotic bat, one silver cylinder shoots a burst of silent 40,000 Hz sound waves. The sound bounces off the car and returns to the second cylinder. The gate times the echo to know exactly how far away the car is.',
    howItWorks: [
      'Sends 40 kHz sound pulse → Bounces off the approaching rover.',
      'Rover closer than 15 cm → Opens Gate 1 and adds +1 to the lap counter!',
    ],
    firmwareDetails: 'Distance (cm) = (Echo Time in µs × 0.0343) ÷ 2.',
    formula: 'Distance = (Speed of Sound 343 m/s × Echo Time) ÷ 2',
    funFact:
      'Dogs and bats can hear ultrasonic frequencies, but they are totally silent to human ears!',
  },

  rgbleds: {
    id: 'rgbleds',
    number: 4,
    name: 'Status Signal Tower',
    shortTitle: 'Signal LEDs',
    category: 'Visual Signals',
    pinout: 'Red (GPIO 21) · Yellow (GPIO 22) · Green (GPIO 23)',
    tagPosition: { x: 80, y: 26 },
    summary: 'Bright traffic lights telling drivers when to stop, prepare, or go.',
    kidExplanation:
      'A 3-color light tower that signals the track status. Red tells the rover to stay put for charging, Yellow warns that gates are moving, and Green means the track is clear to zoom.',
    howItWorks: [
      'Red = Rover stays put for charging; entry and exit gates are closed.',
      'Yellow = Warning chime! Gate servo arms are moving into position.',
      'Green = Harmonic chime plays; gate is raised — track is clear to zoom!',
    ],
    firmwareDetails: 'Digital GPIO outputs with non-blocking timer blink cycles.',
    formula: 'Red = Stop  |  Yellow = Ready  |  Green = Clear to Go!',
    funFact:
      'Electronic LED signal lights react 10 times faster than human race marshals waving flags!',
  },

  buzzer: {
    id: 'buzzer',
    number: 5,
    name: 'Piezo Alert Buzzer',
    shortTitle: 'Alert Buzzer',
    category: 'Audio Feedback',
    pinout: 'PWM Tone (GPIO 25)',
    tagPosition: { x: 74, y: 64 },
    summary: 'Vibrates a microscopic crystal thousands of times a second to play chimes.',
    kidExplanation:
      'A speaker with no moving paper cone! A microscopic piezoceramic crystal disc flexes when electricity hits it, creating sharp beeps, countdown timers, and victory tunes.',
    howItWorks: [
      'Single Beep (1,000 Hz): Rover spotted entering the gate.',
      'Victory Fanfare: Plays a joyful tune when charging completes!',
    ],
    firmwareDetails: 'ledcWriteTone(BUZZER_CHANNEL, freq_hz): Hardware tone synthesis.',
    formula: 'Higher Frequency (Hz) = Higher Musical Pitch',
    funFact:
      'Piezo crystals also work in reverse: squeezing them with your fingers creates real electricity!',
  },

  wifi: {
    id: 'wifi',
    number: 6,
    name: '2.4 GHz WiFi Antenna',
    shortTitle: 'WiFi Antenna',
    category: 'Wireless Telemetry',
    pinout: 'Built-in PCB 2.4 GHz Trace Antenna',
    tagPosition: { x: 50, y: 15 },
    summary: 'Transmits live track telemetry to the laptop dashboard at the speed of light.',
    kidExplanation:
      'The squiggly gold copper line on the edge of the ESP32 is a radio antenna. It whispers live telemetry messages through the air to your computer in less than 5 milliseconds.',
    howItWorks: [
      'Streams live gate positions, car count, and lap times to your screen.',
      'Receives remote open/close commands from the Master Host Console.',
    ],
    firmwareDetails: 'ESPAsyncWebServer + WebSockets: sub-10ms wireless latency.',
    formula: '2.4 Billion Waves per Second @ Speed of Light!',
    funFact:
      'Radio waves travel through air at 300,000 km/s—fast enough to circle Earth 7 times in 1 second!',
  },
};

export const GATE_PART_LIST: GatePartSpec[] = Object.values(GATE_PARTS);
