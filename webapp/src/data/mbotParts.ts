import { MbotPartId, MbotPartSpec } from '../types';

export const MBOT_PARTS: Record<MbotPartId, MbotPartSpec> = {
  mecanum: {
    id: 'mecanum',
    number: 1,
    name: 'Mecanum "Crab-Slide" Wheels',
    shortTitle: 'Mecanum Wheels',
    category: 'Locomotion',
    pinout: '4× DC Motors (Ports 1A, 1B, 2A, 2B)',
    tagPosition: { x: 14, y: 20 },
    summary: 'Angled mini-rollers let the rover glide sideways without turning!',
    kidExplanation:
      'Each wheel is wrapped in 9 diagonal mini-rollers angled at 45°. By spinning the wheels in different directions, the rover can drive forward, reverse, or slide straight sideways like a crab!',
    howItWorks: [
      'All 4 wheels spin forward → Rover drives straight ahead.',
      'Opposite corners spin together → Rover slides sideways!',
    ],
    firmwareDetails: 'Motors.cpp: 4-wheel omnidirectional drive matrix.',
    formula: '4 Wheels Same Way = Forward  |  Crisscross = Sideways Slide!',
    funFact:
      'The US Navy invented Mecanum wheels in 1973 to move airplanes sideways inside tight aircraft carrier hangars!',
  },

  linesensors: {
    id: 'linesensors',
    number: 2,
    name: 'Infrared Track Eyes',
    shortTitle: 'Track Eyes (A6/A7)',
    category: 'Optical Sensing',
    pinout: 'Pins A6 (Left) & A7 (Right)',
    tagPosition: { x: 50, y: 7 },
    summary: 'Invisible light beams look down to stay inside the black track borders.',
    kidExplanation:
      'Two sensors under the nose shine invisible infrared light onto the floor. White road bounces light back (Safe!), while black tape soaks it up like a sponge (Turn away!).',
    howItWorks: [
      'One sensor sees black → Rover gently steers back onto the white road.',
      'Both sensors see black after charging → That’s the Finish Line! 🏁',
    ],
    firmwareDetails: 'LineSensor.cpp: Active-LOW IR reflectance sensors.',
    formula: 'White Floor = Bounce Light (Go!)  |  Black Tape = Absorb Light (Steer!)',
    funFact:
      'Your TV remote uses the exact same invisible infrared light to talk to your television!',
  },

  frontir: {
    id: 'frontir',
    number: 3,
    name: 'Front Gate Detector',
    shortTitle: 'Gate Detector (A15)',
    category: 'Optical Sensing',
    pinout: 'Front Sensor Pin A15',
    tagPosition: { x: 84, y: 15 },
    summary: 'Spots closed gate arms ahead and hits the brakes automatically.',
    kidExplanation:
      'This sensor beams light straight ahead like invisible headlights. When a closed gate barrier reflects that light back, the rover stops automatically without bumping into the gate!',
    howItWorks: [
      'Gate Closed → Stops and waits safely in the charging bay.',
      'Gate Opens → Path is clear! Waits 2 seconds and zooms off.',
    ],
    firmwareDetails: 'BarrierSensor.cpp: Proximity reflection detector.',
    formula: 'Closer Gate = Stronger Light Echo → Auto-Brake!',
    funFact:
      'Automatic paper-towel dispensers and faucets in restrooms use this same trick to spot your hands!',
  },

  rgbleds: {
    id: 'rgbleds',
    number: 4,
    name: 'Smart Rainbow Light Bars',
    shortTitle: 'Rainbow LEDs',
    category: 'Visual Feedback',
    pinout: 'Left & Right 4-LED Bars (Pins A11 & A12)',
    tagPosition: { x: 14, y: 54 },
    summary: '8 smart color-changing lights that show what the rover is thinking.',
    kidExplanation:
      'Each side has 4 tiny computer-controlled lights that mix Red, Green, and Blue to make 16 million colors! They tell you when the rover is ready, charging, or celebrating.',
    howItWorks: [
      'Cyan Blink = Ready to Charge · Green Blink = Charging · Red = Too Hot!',
      'Finish Line = 7-second fast chasing rainbow to celebrate a complete loop! 🏁',
    ],
    firmwareDetails: 'LEDs.cpp: WS2812B individually addressable RGB LEDs.',
    formula: 'Red + Green + Blue Light = 16.7 Million Colors!',
    funFact:
      'Every single tiny LED square has its own microscopic computer chip hidden inside!',
  },

  megapi: {
    id: 'megapi',
    number: 5,
    name: 'MegaPi Robot Brain',
    shortTitle: 'Robot Brain',
    category: 'Compute & Control',
    pinout: 'ATmega2560 @ 16 MHz',
    tagPosition: { x: 86, y: 48 },
    summary: 'Checks all sensors and steers the wheels 2,500 times every second!',
    kidExplanation:
      'The red circuit board in the middle is the rover’s brain. It reads the track eyes, checks the gate detector, and updates the wheels and lights 2,500 times every single second!',
    howItWorks: [
      'Auto Mode: Drives itself around the track and stops at the charger.',
      'Manual Mode: Lets the host drive it like an RC car over Bluetooth.',
    ],
    firmwareDetails: 'mbot_mega_firmware.ino: Non-blocking state machine.',
    formula: '2,500 Decisions Per Second = Super Fast Reflexes!',
    funFact:
      'This single red board has 70 connection pins—enough to run a 3D printer or a giant robot arm!',
  },

  ble: {
    id: 'ble',
    number: 6,
    name: 'Bluetooth Wireless Radio',
    shortTitle: 'Bluetooth Radio',
    category: 'Wireless Comms',
    pinout: 'Serial3 Wireless Port',
    tagPosition: { x: 84, y: 78 },
    summary: 'Talks wirelessly to this computer screen in less than a blink!',
    kidExplanation:
      'This blue radio module connects the rover directly to the web browser without any wires. When you press Start or Charge, the rover hears it in less than 1 millisecond!',
    howItWorks: [
      'Computer → Rover: Sends Start, Stop, and Charging light signals.',
      'Rover → Computer: Tells the screen when it docks or crosses the Finish Line!',
    ],
    firmwareDetails: 'Web Bluetooth GATT Service (115,200 bps).',
    formula: 'Wireless Signal Time < 0.001 Seconds (Instant!)',
    funFact:
      'Bluetooth was named after a 10th-century Viking king, Harald "Bluetooth" Gormsson, who united Denmark and Norway!',
  },

  bumpers: {
    id: 'bumpers',
    number: 7,
    name: 'Rear Safety Bumpers',
    shortTitle: 'Safety Bumpers',
    category: 'Safety Hardware',
    pinout: 'Rear Switches A9 & A10',
    tagPosition: { x: 18, y: 84 },
    summary: 'Click-switches on the back that stop the car if it backs into anything.',
    kidExplanation:
      'Two spring-loaded metal switches guard the back of the rover. If the rover ever bumps into a wall while backing up, the lever clicks and cuts reverse power right away!',
    howItWorks: [
      'Switch Clicked → Blocks reverse motors and flashes red warning lights.',
      'Still allows driving forward so the rover can pull away safely!',
    ],
    firmwareDetails: 'CollisionSensor.cpp: Snap-action limit switches.',
    formula: 'Bumper Clicked = Instant Reverse Brake!',
    funFact:
      'The spring inside a microswitch snaps shut in less than 1/1000th of a second!',
  },
};

export const MBOT_PART_LIST: MbotPartSpec[] = Object.values(MBOT_PARTS);

export interface ScienceTopic {
  id: 'ultrasonic' | 'battery' | 'thermal';
  badge: string;
  title: string;
  subtitle: string;
  lead: string;
  steps: string[];
  formula: string;
  solveExample?: {
    title: string;
    scenario: string;
    formula: string;
    given: string[];
    steps: string[];
    result: string;
    takeaway: string;
  };
  fact: string;
}

export const SCIENCE_TOPICS: Record<'ultrasonic' | 'battery' | 'thermal', ScienceTopic> = {
  ultrasonic: {
    id: 'ultrasonic',
    badge: 'Supercharger Gate Radar',
    title: 'How Gate 1 Uses Sound Echoes to Spot the Car',
    subtitle: '40 kHz sound pulses measure distance and trigger the traffic light.',
    lead:
      'Just like bats and dolphins find their way in the dark, Gate 1 shoots out high-pitched sound waves (too high for human ears!) and times how fast the echo bounces off the rover.',
    steps: [
      'When the rover gets closer than 5 cm, Gate 1 adds +1 to the Car Counter!',
      'The Traffic Light counts down Red → Yellow → Green with musical beeps and lifts the gate arm.',
    ],
    formula: 'Distance = (Sound Speed × Echo Time) ÷ 2',
    solveExample: {
      title: 'Simple Solve Example: Measuring 5 cm Distance',
      scenario: 'Gate 1 emits an ultrasonic chirp and receives the echo bounce from the approaching rover 292 microseconds later. How far away is the car?',
      formula: 'Distance (cm) = (Sound Speed 0.0343 cm/µs × Echo Time) ÷ 2',
      given: [
        'Speed of Sound = 343 m/s = 0.0343 cm/µs',
        'Echo Round-Trip Time = 292 µs',
      ],
      steps: [
        'Step 1 (Total Round-Trip Distance): 0.0343 cm/µs × 292 µs = 10.0 cm',
        'Step 2 (Divide by 2 for One-Way): 10.0 cm ÷ 2 = 5.0 cm',
      ],
      result: 'Distance = 5.0 cm (Trip Threshold Reached!)',
      takeaway: 'The rover is at 5.0 cm, automatically triggering the car counter (+1) and Gate 1 traffic light countdown!',
    },
    fact: 'Why divide by 2? Because the sound wave travels from the gate to the car AND all the way back!',
  },
  battery: {
    id: 'battery',
    badge: 'EV Battery Tank & Power Speed',
    title: 'How Fast Can You Fill an Electric Car Battery?',
    subtitle: 'Balancing battery size (mAh), charging speed (mA), and time.',
    lead:
      'Think of an EV battery like a water tank for electricity! Our battery holds 2,300 mAh when full, and your rover rolls into the station with 20% left in the tank.',
    steps: [
      'To fill the missing 80%, we need to pump 1,840 mAh of energy into the battery.',
      'Higher Power Flow (mA) fills the battery faster—so you beat the timer!',
    ],
    formula: 'Charging Speed (mA) = Energy Needed (1,840 mAh) ÷ Time (Hours)',
    solveExample: {
      title: 'Simple Solve Example: 30-Minute Charge Challenge',
      scenario: 'Your rover rolls into the supercharger at 20% battery and must reach 100% in 30 minutes (0.5 hours). What minimum current (mA) should you dial in?',
      formula: 'Current (mA) = Capacity Needed (mAh) ÷ Time (Hours)',
      given: [
        'Total Battery Capacity = 2,300 mAh',
        'Initial Charge = 20% (460 mAh currently in tank)',
        'Charge Needed = 2,300 mAh − 460 mAh = 1,840 mAh (80%)',
        'Target Charging Time = 30 minutes = 0.5 hours',
      ],
      steps: [
        'Step 1 (Convert minutes to hours): 30 min ÷ 60 min/hr = 0.5 hours',
        'Step 2 (Divide needed energy by hours): 1,840 mAh ÷ 0.5 hr = 3,680 mA',
      ],
      result: 'Minimum Current = 3,680 mA',
      takeaway: 'Dial your slider to at least 3,680 mA to fill the battery before the 30-minute timer hits zero!',
    },
    fact: 'mAh stands for milliAmp-hours—it tells you how much energy the battery can store!',
  },
  thermal: {
    id: 'thermal',
    badge: 'Beat the Heat!',
    title: 'Why Pushing Too Much Power Makes Batteries Overheat',
    subtitle: 'Fast charging creates friction heat inside the battery.',
    lead:
      'When electricity rushes into a battery, it rubs against the battery’s internal parts and makes heat—just like rubbing your hands together fast on a cold day!',
    steps: [
      'Double the Charging Speed (mA) = FOUR TIMES the heat inside the battery!',
      'Your Goal: Pick the "Goldilocks" speed—fast enough to finish on time, but cool enough to stay under 61.9°C!',
    ],
    formula: 'Heat = Power Speed × Power Speed  (2× Speed = 4× Heat! 🔥)',
    solveExample: {
      title: 'Simple Solve Example: Why 2× Current = 4× Heat',
      scenario: 'Comparing battery heating at gentle 2A (2,000 mA) charging vs aggressive 4A (4,000 mA) supercharging with internal resistance Rs = 0.05 Ω.',
      formula: 'Heat Power (Watts) = Current² (Amps) × Internal Resistance (Ω)',
      given: [
        'Battery Internal Resistance (Rs) = 0.05 Ω',
        'Test A (Gentle Charge): Current I = 2 Amps',
        'Test B (Fast Charge): Current I = 4 Amps (2× current!)',
      ],
      steps: [
        'Test A Heat: 2² × 0.05 Ω = 4 × 0.05 = 0.20 Watts (Cool & Safe 🟢)',
        'Test B Heat: 4² × 0.05 Ω = 16 × 0.05 = 0.80 Watts (4× Heat Spike! 🔥)',
      ],
      result: '0.80 W ÷ 0.20 W = 4× More Heat Generated!',
      takeaway: 'Doubling charging speed generates 4 times the internal heat! Keep your current in the green sweet-spot so core temperature stays safely below 61.9°C.',
    },
    fact: 'Real electric cars pump cold liquid coolant around their batteries during Supercharging to keep them chilly!',
  },
};
