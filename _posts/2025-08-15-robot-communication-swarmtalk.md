---
title: "Building Robot Communication Networks with SwarmTalk"
date: 2025-08-15
permalink: /posts/2025/08/swarmtalk-guide/
tags:
  - communication
  - ESP32
  - ROS2
  - UAV
  - swarm-robotics
  - ESP-NOW
---

## The Foundation of Robot Teamwork

You've learned to plan paths (TrajGenPy) and coordinate tasks (TrajAllocPy), but there's one crucial piece missing: **communication**. How do robots actually talk to each other in the field? Meet **SwarmTalk** - your solution for reliable, low-cost robot-to-robot communication using ESP32 modules and ESP-NOW protocol.

## Why Communication Matters

Imagine your robot team in action:

- **Robot A** discovers an obstacle and needs to update the team
- **Robot B** finds the target and wants to redirect others
- **Robot C** has low battery and requests backup

Without communication, each robot operates in isolation. With SwarmTalk, they become a truly coordinated team.

## What Makes SwarmTalk Special

### Traditional Approaches vs. SwarmTalk

**Traditional Radio Systems:**
- Expensive ($500-2000 per unit)
- Complex licensing requirements
- Heavy and power-hungry
- Centralized architecture

**SwarmTalk:**
- Low-cost ESP32 modules ($5-15 each)
- Uses license-free 2.4GHz Wi-Fi spectrum
- Lightweight and efficient
- Fully decentralized (no base station needed)

### Key Advantages

- **🔄 Decentralized**: No single point of failure
- **📡 Ad-hoc**: Robots join/leave dynamically
- **🤖 ROS2 Native**: Seamless integration with robot software
- **💰 Affordable**: Democratizes swarm robotics
- **⚡ High-speed**: Up to 1490 bytes per message
- **🔧 Plug-and-play**: Minimal configuration required

## System Architecture Overview

SwarmTalk consists of three main components:

```
[ROS2 Node] ←→ [Serial/USB] ←→ [ESP32 + ESP-NOW] ~~~~ [Other Robots]
```

1. **ROS2 Driver Node**: Handles message routing and topics
2. **Serial Communication**: USB connection to ESP32
3. **ESP32 Firmware**: Wireless communication using ESP-NOW

## Hardware Setup

### What You'll Need

**Per Robot:**
- ESP32 module (C3, C6, or S3 variants supported)
- USB cable for connection to onboard computer
- Optional: External antenna for extended range

**Recommended ESP32 Modules:**
- **ESP32-S3**: Best performance, external antenna support
- **ESP32-C6**: Good balance of features and cost
- **ESP32-C3**: Most affordable option

### Connection Diagram

```
Robot Computer (Raspberry Pi/Jetson)
       |
   USB Cable
       |
    ESP32 Module
       |
  ESP-NOW Radio ~~~~ Other ESP32 Modules
```

## Software Installation

### Step 1: Install Dependencies

```bash
# Install ROS2 Humble (if not already installed)
sudo apt update
sudo apt install ros-humble-desktop

# Install SwarmTalk
git clone https://github.com/kasperg3/swarmtalk.git
cd swarmtalk

# Install Python dependencies
pip install pyserial trajallocpy shapely matplotlib numpy geojson
```

### Step 2: Build ROS2 Packages

```bash
# Source ROS2 environment
source /opt/ros/humble/setup.bash

# Build SwarmTalk packages
colcon build --symlink-install --packages-skip swarmtalk_firmware
source install/setup.bash
```

### Step 3: Flash ESP32 Firmware

**Option A: Web-based Installer (Easiest)**
1. Connect ESP32 via USB
2. Open SwarmTalk web installer in Chrome/Edge
3. Select your ESP32 model and flash

**Option B: Command Line**
```bash
cd firmware
idf.py -p /dev/ttyUSB0 build flash monitor
```

## Basic Communication Setup

### Configuration Files

Each robot needs its own configuration. Here's the setup for a 3-robot team:

**Robot 0 Config** (`config/config_agent0.yaml`):
```yaml
driver:
  ros__parameters:
    port: '/dev/ttyACM0'    # USB port for ESP32

planner:
  ros__parameters:
    n_agents: 3             # Total team size
    agent_id: 0             # This robot's ID
    capacity: 3000          # Task capacity
```

**Robot 1 Config** (`config/config_agent1.yaml`):
```yaml
driver:
  ros__parameters:
    port: '/dev/ttyACM1'    # Different USB port

planner:
  ros__parameters:
    n_agents: 3
    agent_id: 1             # Different ID
    capacity: 3000
```

### Launching the System

**Terminal 1 - Robot 0:**
```bash
# Launch communication driver
source install/setup.bash
ros2 run communication driver --ros-args --params-file config/config_agent0.yaml
```

**Terminal 2 - Robot 0:**
```bash
# Launch planning node
source install/setup.bash
ros2 run planning planner --ros-args --params-file config/config_agent0.yaml
```

Repeat for each robot with their respective config files.

## Your First Communication Test

### Send a Simple Message

```python
import rclpy
from rclpy.node import Node
from common_interface.msg import ByteArray

class TestSender(Node):
    def __init__(self):
        super().__init__('test_sender')
        self.publisher = self.create_publisher(
            ByteArray, 
            '/communication/broadcast', 
            10
        )
        
        # Send test message every 2 seconds
        self.timer = self.create_timer(2.0, self.send_message)
        self.counter = 0
        
    def send_message(self):
        message_text = f"Hello from Robot! Count: {self.counter}"
        message_bytes = message_text.encode('utf-8')
        
        # Convert to ByteArray message format
        msg = ByteArray()
        msg.bytes = [bytes([b]) for b in message_bytes]
        
        self.publisher.publish(msg)
        self.get_logger().info(f'Sent: {message_text}')
        self.counter += 1

# Run the sender
rclpy.init()
sender = TestSender()
rclpy.spin(sender)
```

### Receive Messages

```python
import rclpy
from rclpy.node import Node
from common_interface.msg import ByteArray

class TestReceiver(Node):
    def __init__(self):
        super().__init__('test_receiver')
        self.subscription = self.create_subscription(
            ByteArray,
            '/communication/message',
            self.message_callback,
            10
        )
        
    def message_callback(self, msg):
        # Convert ByteArray back to string
        message_bytes = b''.join(msg.bytes)
        message_text = message_bytes.decode('utf-8')
        
        self.get_logger().info(f'Received: {message_text}')

# Run the receiver
rclpy.init()
receiver = TestReceiver()
rclpy.spin(receiver)
```

## Real-World Communication Patterns

### 1. Heartbeat System

Keep track of team status:

```python
class HeartbeatManager(Node):
    def __init__(self, robot_id):
        super().__init__(f'heartbeat_{robot_id}')
        self.robot_id = robot_id
        self.last_seen = {}
        
        # Send heartbeat every second
        self.create_timer(1.0, self.send_heartbeat)
        
        # Check for lost robots every 5 seconds
        self.create_timer(5.0, self.check_team_status)
        
    def send_heartbeat(self):
        message = f"HEARTBEAT:{self.robot_id}:{time.time()}"
        self.broadcast_message(message.encode())
        
    def check_team_status(self):
        current_time = time.time()
        for robot_id, last_time in self.last_seen.items():
            if current_time - last_time > 10:  # 10 second timeout
                self.get_logger().warn(f'Lost contact with Robot {robot_id}')
```

### 2. Task Updates

Share mission progress:

```python
class TaskCoordinator(Node):
    def __init__(self, robot_id):
        super().__init__(f'coordinator_{robot_id}')
        self.robot_id = robot_id
        
    def report_task_completion(self, task_id, success):
        message = {
            'type': 'TASK_COMPLETE',
            'robot_id': self.robot_id,
            'task_id': task_id,
            'success': success,
            'timestamp': time.time()
        }
        
        # Convert dictionary to JSON string then to bytes
        json_message = json.dumps(message)
        self.broadcast_message(json_message.encode())
        
    def request_help(self, location, task_type):
        message = {
            'type': 'HELP_REQUEST',
            'robot_id': self.robot_id,
            'location': location,
            'task_type': task_type,
            'priority': 'HIGH'
        }
        
        json_message = json.dumps(message)
        self.broadcast_message(json_message.encode())
```

### 3. Emergency Protocols

Handle critical situations:

```python
class EmergencyManager(Node):
    def __init__(self, robot_id):
        super().__init__(f'emergency_{robot_id}')
        self.robot_id = robot_id
        
    def declare_emergency(self, emergency_type, details):
        message = {
            'type': 'EMERGENCY',
            'robot_id': self.robot_id,
            'emergency_type': emergency_type,  # 'LOW_BATTERY', 'COLLISION', 'LOST'
            'details': details,
            'location': self.get_current_position(),
            'timestamp': time.time()
        }
        
        # Send emergency message multiple times for reliability
        json_message = json.dumps(message)
        for _ in range(3):
            self.broadcast_message(json_message.encode())
            time.sleep(0.1)
```

## Performance Optimization

### Message Size Management

ESP-NOW has a 1490-byte limit per message:

```python
def send_large_data(self, data):
    """Split large messages into chunks"""
    max_chunk_size = 1400  # Leave room for headers
    
    if len(data) <= max_chunk_size:
        self.broadcast_message(data)
    else:
        # Split into chunks
        chunks = [data[i:i+max_chunk_size] 
                 for i in range(0, len(data), max_chunk_size)]
        
        for i, chunk in enumerate(chunks):
            header = f"CHUNK:{i}:{len(chunks)}:".encode()
            self.broadcast_message(header + chunk)
```

### Network Health Monitoring

```python
class NetworkMonitor(Node):
    def __init__(self):
        super().__init__('network_monitor')
        self.message_stats = {}
        
    def log_message_received(self, sender_id):
        if sender_id not in self.message_stats:
            self.message_stats[sender_id] = {'count': 0, 'last_seen': 0}
            
        self.message_stats[sender_id]['count'] += 1
        self.message_stats[sender_id]['last_seen'] = time.time()
        
    def get_network_health(self):
        """Return network statistics"""
        current_time = time.time()
        health_report = {}
        
        for robot_id, stats in self.message_stats.items():
            time_since_last = current_time - stats['last_seen']
            health_report[robot_id] = {
                'message_count': stats['count'],
                'seconds_since_last': time_since_last,
                'status': 'ONLINE' if time_since_last < 5 else 'OFFLINE'
            }
            
        return health_report
```

## Docker Deployment

For easy multi-robot deployment:

```bash
# Launch entire 3-robot system
docker-compose up --build

# Scale to more robots
docker-compose up --scale communication0=1 --scale planning0=1 \
                  --scale communication1=1 --scale planning1=1 \
                  --scale communication2=1 --scale planning2=1
```

## Range and Reliability

### Expected Performance

- **Range**: ~200m line-of-sight
- **Throughput**: Several hundred messages/second
- **Latency**: <10ms typical
- **Reliability**: >95% in good conditions

### Improving Range and Reliability

1. **External Antennas**: Increase range to 500m+
2. **Mesh Networking**: Robots relay messages for extended coverage
3. **Frequency Management**: Avoid Wi-Fi congestion
4. **Error Handling**: Implement acknowledgments and retries

## Troubleshooting Common Issues

### ESP32 Not Detected
```bash
# Check USB connection
ls /dev/ttyUSB* /dev/ttyACM*

# Add user to dialout group
sudo usermod -a -G dialout $USER
# (Requires logout/login)
```

### No Messages Received
1. Check ESP32 firmware is properly flashed
2. Verify all robots on same ESP-NOW channel
3. Ensure ESP32 modules are compatible (same variant)

### Poor Performance
1. Reduce message frequency
2. Check for Wi-Fi interference
3. Verify power supply to ESP32

## Integration with Mission Planning

Combine SwarmTalk with TrajAllocPy for complete coordination:

```python
class IntegratedMissionManager(Node):
    def __init__(self, robot_id):
        super().__init__(f'mission_manager_{robot_id}')
        self.robot_id = robot_id
        
        # Initialize communication
        self.comm = SwarmTalkInterface(robot_id)
        
        # Initialize task allocation
        self.allocator = TaskAllocator(robot_id)
        
    def run_coordinated_mission(self, tasks):
        # 1. Share tasks with team
        self.comm.broadcast_tasks(tasks)
        
        # 2. Run CBBA allocation
        allocation = self.allocator.solve(tasks)
        
        # 3. Share results
        self.comm.broadcast_allocation(allocation)
        
        # 4. Execute assigned tasks
        self.execute_mission(allocation[self.robot_id])
```

## Next Steps

Now that you have robots communicating:

1. **Test range limits** in your deployment environment
2. **Implement error handling** for message loss
3. **Add encryption** for sensitive missions
4. **Explore mesh networking** for larger teams
5. **Learn about datasets** for testing (our next topic: SARenv)

In our next post, we'll dive into **SARenv** - a comprehensive dataset for testing your robot teams in realistic search and rescue scenarios.

---

**Ready to connect your robot team?** Start with two robots and a simple message exchange. Build complexity gradually as you gain confidence with the system!
