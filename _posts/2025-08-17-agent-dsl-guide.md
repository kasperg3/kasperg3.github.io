---
title: "Agent-DSL: Defining Safe and Intelligent Robot Behavior"
date: 2025-08-17
permalink: /posts/2025/08/agent-dsl-guide/
tags:
  - domain-specific-language
  - safety
  - autonomous-agents
  - ROS2
  - PX4
  - operations-planning
---

## The Final Piece: Intelligent Operation Management

You've mastered path planning, task coordination, communication, and testing. Now it's time to bring it all together with **Agent-DSL** - a domain-specific language that defines intelligent, safety-critical behavior for your autonomous robot operations.

## Why Agent-DSL?

### The Challenge of Complex Operations

Real-world robot missions involve:

- **Safety constraints**: Geofencing, emergency procedures, weather limits
- **Operational requirements**: Battery management, communication protocols
- **Regulatory compliance**: Airspace restrictions, flight permissions
- **Multi-agent coordination**: Operation-level planning and monitoring

Traditional approaches require:

- **Hardcoded safety logic** scattered across multiple files
- **Manual configuration** for each mission
- **Complex integration** between safety systems and mission planning
- **Error-prone** parameter management

### Agent-DSL Solution

Agent-DSL provides:

- **Declarative specification** of agent behavior and constraints
- **Automatic code generation** for ROS2 nodes and safety systems
- **Centralized safety management** with emergency protocols
- **Operation-level coordination** with multi-agent planning
- **PX4 integration** for realistic simulation and deployment

## Understanding the Agent-DSL Architecture

### Core Components

```
Agent Definition → Code Generator → ROS2 System
     ↓               ↓              ↓
   Safety Rules → Python Classes → Safety Monitors
     ↓               ↓              ↓
  Operations → Message Types → Mission Coordinators
```

1. **Agent Specification**: Declarative behavior definition
2. **Safety Constraints**: Emergency and contingency handling
3. **Operation Planning**: Multi-agent mission coordination
4. **Code Generation**: Automatic ROS2 integration

## Setting Up Agent-DSL

### Prerequisites

```bash
# Install ROS2 Humble
sudo apt update
sudo apt install ros-humble-desktop

# Install Python dependencies
pip install textx jinja2 pyyaml
```

### Installation

```bash
# Create ROS2 workspace
mkdir -p ~/workspace/mdsd_ws/src
cd ~/workspace/mdsd_ws/src

# Clone Agent-DSL repository
git clone <agent-dsl-repo>
cd mdsd-1

# Generate code for your first agent
./generate.zsh quad0

# Build workspace
cd ../..
colcon build --symlink-install
source install/setup.bash
```

## Your First Agent Definition

### Basic Agent Structure

Create `agents/quad0.agent`:

```cpp
import simulation [id 0 at 0,0 with battery simulation enabled]
import airspace [EKOD,EKCP,EKBI]

volumes: 
  flight_geometry: [[10.34261,55.48038],[10.32339,55.47399],[10.32560,55.47156]]
  contingency_volume: [[10.38002,55.47930],[10.36054,55.51121],[10.27119,55.48253]]
  air_risk_buffer: [[10.25000,55.38833],[10.14083,55.48833],[10.40000,55.57167]]
end volumes

agent quad0: multicopter with camera and lidar
  id: 0
  flight_time: 40 minutes

  beat:
    heartbeat every 1 second
    metabeat every 1 minutes
  end beat

  inform:
    notice every 10 seconds
    warning every 5 seconds
    alarm every 1 second
  end inform
end agent

emergency:
  volume: agent out of flight_geometry activate rtl
  component: battery level lower than 5 percent activate fts
  component: battery level lower than 15 percent activate land
end emergency

contingency:
  volume: aircraft within air_risk_buffer activate rtl
  component: battery level lower than 30 percent activate rtl
  component: battery level lower than 40 percent activate warning
  component: c2 package_loss higher than 15 percent activate warning
end contingency
```

### Understanding the Syntax

**Import Statements**:

- `simulation`: Enables simulation mode with battery modeling
- `airspace`: Defines allowed airspace zones

**Volumes**: Geographic boundaries for operations

- `flight_geometry`: Normal operating area
- `contingency_volume`: Extended operational area  
- `air_risk_buffer`: Safety buffer zone

**Agent Configuration**:

- Platform type (`multicopter`) and sensors (`camera`, `lidar`)
- Flight duration and operational parameters
- Communication heartbeat intervals

**Safety Systems**:

- `emergency`: Critical situations requiring immediate action
- `contingency`: Degraded conditions requiring modified behavior

## Safety-First Design Philosophy

### Emergency Protocols

Agent-DSL implements a **hierarchical safety system**:

```
Emergency (Critical) → Immediate Action (RTL, FTS, Land)
    ↓
Contingency (Degraded) → Modified Operation (Warning, RTL)
    ↓
Normal Operations → Standard Mission Execution
```

### Example Emergency Scenarios

```cpp
emergency:
  // Geographic constraints
  volume: agent out of flight_geometry activate rtl
  
  // System health
  component: battery level lower than 5 percent activate fts
  component: gps accuracy worse than 5 meters activate land
  component: motor temperature higher than 85 celsius activate land
  
  // Communication
  component: c2 package_loss higher than 90 percent activate fts
  
  // Weather
  environment: wind speed higher than 15 mps activate rtl
end emergency
```

### Contingency Management

```cpp
contingency:
  // Preemptive actions
  component: battery level lower than 30 percent activate rtl
  component: c2 package_loss higher than 15 percent activate warning
  
  // Performance degradation
  component: mission progress lower than 50 percent activate replanning
  
  // Environmental factors
  environment: visibility lower than 100 meters activate slow_mode
end contingency
```

## Multi-Agent Operation Planning

### Operation Definition

Create `operations/search_rescue.op`:

```cpp
bounding_area = POLYGON([10.325,55.472],[10.324,55.473],[10.322,55.472])
search_area = POLYGON([10.323,55.472],[10.324,55.472],[10.325,55.472])

Operation WildernessSearchAndRescue using 3 uavs within bounding_area:
    monitor search_area priority high
    monitor search_perimeter priority medium
    establish communication_relay at center
    maintain minimum_separation 50 meters
end
```

### Advanced Operations

```cpp
Operation CoordinatedInspection using 5 uavs within inspection_zone:
    // Sequential tasks
    sequence:
        survey area_north with 2 uavs
        wait_for completion
        survey area_south with 3 uavs
    end sequence
    
    // Parallel tasks  
    parallel:
        establish overwatch at high_altitude with 1 uav
        perform detailed_scan with remaining uavs
    end parallel
    
    // Conditional logic
    if weather_degraded:
        reduce team_size to 3
        increase separation to 100 meters
    end if
end
```

## Code Generation and Integration

### Generated Artifacts

When you run `./generate.zsh quad0`, Agent-DSL creates:

```
generated/
├── ros2_packages/
│   ├── quad0_interfaces/          # Custom message types
│   ├── quad0_safety/             # Safety monitoring nodes  
│   ├── quad0_coordination/       # Mission coordination
│   └── quad0_launch/             # Launch files
├── python_classes/
│   ├── Agent.py                  # Agent behavior class
│   ├── SafetyMonitor.py         # Safety system
│   └── OperationManager.py      # Operation coordination
└── config/
    ├── safety_params.yaml       # Safety thresholds
    ├── mission_config.yaml      # Mission parameters
    └── px4_config.yaml          # PX4 integration
```

### ROS2 Integration

The generated system creates these ROS2 topics:

```bash
# Safety monitoring
/quad0/safety/battery_status
/quad0/safety/position_status  
/quad0/safety/communication_status

# Mission coordination
/operation/task_allocation
/operation/agent_status
/operation/emergency_broadcast

# Agent communication
/quad0/heartbeat
/quad0/mission_status
/quad0/sensor_data
```

## Launching Your Agent System

### Single Agent Launch

```bash
# Launch the complete agent system
ros2 launch mdsd_ros_pkg quad0_launch.py

# Or launch components individually:
ros2 run quad0_safety safety_monitor
ros2 run quad0_coordination mission_coordinator  
ros2 run quad0_interfaces heartbeat_publisher
```

### Multi-Agent Operation

```bash
# Launch operation planner
ros2 run operation_planning planner_node.py

# Launch individual agents
ros2 launch mdsd_ros_pkg quad0_launch.py &
ros2 launch mdsd_ros_pkg quad1_launch.py &
ros2 launch mdsd_ros_pkg quad2_launch.py &

# Monitor operation status
ros2 topic echo /operation/status
```

## PX4 Simulation Integration

### Setting Up PX4

```bash
# Clone and setup PX4 (if not already done)
cd ~/
git clone https://github.com/PX4/PX4-Autopilot.git --recursive
bash ./PX4-Autopilot/Tools/setup/ubuntu.sh

# Add to ~/.bashrc
export PX4_DIR=~/PX4-Autopilot

# Build simulation
cd $PX4_DIR
HEADLESS=1 make px4_sitl gz_x500
```

### Agent-DSL PX4 Integration

```bash
# Launch PX4 simulation with Agent-DSL
ros2 launch quad0_simulation px4_agent_sim.launch.py

# This automatically:
# 1. Starts PX4 SITL simulation
# 2. Spawns the agent in Gazebo
# 3. Launches Agent-DSL safety systems
# 4. Connects to mission planning
```

## Advanced Agent Behaviors

### Adaptive Mission Planning

```cpp
agent adaptive_searcher: multicopter with thermal_camera
  id: 1
  
  behavior:
    // Dynamic replanning based on findings
    on victim_detected:
      broadcast location to team
      request additional_resources
      expand search_radius by 200 meters
    end on
    
    // Adaptive search patterns
    if probability_map_updated:
      recalculate optimal_path
      coordinate with team_members
    end if
  end behavior
end agent
```

### Environmental Adaptation

```cpp
agent weather_adaptive: multicopter with camera and lidar
  id: 2
  
  environmental_response:
    wind_speed > 10 mps: reduce_altitude to 30 meters
    visibility < 100 meters: activate_obstacle_avoidance_mode
    temperature < -10 celsius: enable_cold_weather_mode
    precipitation_detected: return_to_base unless critical_mission
  end environmental_response
end agent
```

### Team Coordination Behaviors

```cpp
agent team_leader: multicopter with communication_relay
  id: 0
  role: coordinator
  
  team_management:
    monitor all_team_members every 5 seconds
    
    if member_offline > 30 seconds:
      redistribute_tasks among remaining_members
      notify_human_operator
    end if
    
    if mission_efficiency < 70 percent:
      trigger_replanning
      adjust_team_formation
    end if
  end team_management
end agent
```

## Safety System Deep Dive

### Battery Management

```cpp
battery_management:
  // Critical levels
  emergency_level: 5 percent
  return_home_level: 15 percent
  conservative_mode_level: 30 percent
  
  // Adaptive thresholds based on mission
  if distance_to_base > 2 kilometers:
    increase return_home_level to 25 percent
  end if
  
  // Weather considerations  
  if wind_speed > 8 mps:
    increase all_levels by 10 percent
  end if
end battery_management
```

### Communication Monitoring

```cpp
communication_health:
  heartbeat_timeout: 5 seconds
  data_loss_threshold: 15 percent
  signal_strength_minimum: -80 dBm
  
  degradation_response:
    packet_loss > 10 percent: switch_to_low_bandwidth_mode
    signal_strength < -85 dBm: move_toward_base_station
    heartbeat_lost: activate_emergency_protocol
  end degradation_response
end communication_health
```

### Geofencing Integration

```cpp
geofencing:
  // Multiple fence types
  hard_fence: flight_geometry  // Never cross
  soft_fence: contingency_volume  // Warning zone
  
  violation_response:
    hard_fence_breach: immediate_rtl
    soft_fence_approach: reduce_speed and alert_operator
    
    // Adaptive fencing
    if weather_deteriorating:
      shrink_soft_fence by 20 percent
    end if
  end violation_response
end geofencing
```

## Integration with Previous Tools

### Complete System Integration

```python
# Example integration with your full robot stack
class IntegratedMissionSystem:
    def __init__(self):
        # Agent-DSL safety and coordination
        self.agent_dsl = AgentDSLInterface()
        
        # SwarmTalk communication
        self.communication = SwarmTalkManager()
        
        # TrajAllocPy task allocation
        self.task_allocator = TaskAllocationManager()
        
        # TrajGenPy path planning
        self.path_planner = PathPlanningManager()
        
        # SARenv testing framework
        self.evaluator = SARenvEvaluator()
        
    def execute_mission(self, mission_definition):
        # 1. Parse mission using Agent-DSL
        mission_plan = self.agent_dsl.parse_mission(mission_definition)
        
        # 2. Generate tasks using TrajGenPy
        coverage_tasks = self.path_planner.generate_coverage_tasks(mission_plan.area)
        
        # 3. Allocate tasks using TrajAllocPy
        task_allocation = self.task_allocator.allocate_tasks(coverage_tasks)
        
        # 4. Monitor execution with safety systems
        safety_monitor = self.agent_dsl.create_safety_monitor()
        
        # 5. Execute with SwarmTalk coordination
        return self.communication.execute_coordinated_mission(
            task_allocation, safety_monitor
        )
```

### Configuration Management

```yaml
# Complete system configuration
integrated_mission:
  # Agent-DSL settings
  safety:
    emergency_protocols: enabled
    geofencing: strict
    communication_monitoring: enabled
    
  # TrajGenPy settings  
  path_planning:
    coverage_type: boustrophedon
    overlap_percentage: 20
    altitude: 50
    
  # TrajAllocPy settings
  task_allocation:
    algorithm: cbba
    max_iterations: 100
    convergence_threshold: 0.01
    
  # SwarmTalk settings
  communication:
    heartbeat_interval: 1.0
    message_retry_count: 3
    network_timeout: 5.0
    
  # SARenv settings
  evaluation:
    scenario_size: medium
    victim_count: 2
    terrain_type: mountainous
```

## Monitoring and Debugging

### Real-time System Monitoring

```bash
# Monitor all safety systems
ros2 topic echo /system/safety_status

# Monitor mission progress
ros2 topic echo /operation/mission_progress

# Monitor communication health
ros2 topic echo /swarmtalk/network_status

# Monitor task allocation
ros2 topic echo /task_allocation/assignments
```

### Debugging Agent Behavior

```bash
# Enable debug mode in Agent-DSL
ros2 param set /quad0/safety_monitor debug_mode true

# View generated safety rules
cat generated/config/safety_params.yaml

# Monitor safety state transitions
ros2 topic echo /quad0/safety/state_transitions
```

## Best Practices for Agent-DSL

### 1. Safety-First Development

- **Always define emergency protocols** before normal operations
- **Test safety systems** in simulation extensively  
- **Use conservative thresholds** initially, tune based on experience
- **Implement graceful degradation** for all failure modes

### 2. Modular Operation Design

```cpp
// Break complex operations into modular components
Operation ComplexMission:
    include StandardSafetyProtocols
    include CommunicationManagement
    include TaskCoordination
    
    // Mission-specific logic
    sequence:
        call PreflightChecks
        call AreaSurvey  
        call DataCollection
        call PostflightProcedures
    end sequence
end
```

### 3. Testing Strategy

```bash
# 1. Unit test individual components
ros2 test quad0_safety

# 2. Integration testing  
ros2 launch test_integration.launch.py

# 3. Simulation validation
ros2 launch px4_simulation_test.launch.py

# 4. SARenv evaluation
python run_sarenv_evaluation.py --agent-config quad0.agent
```

### 4. Documentation and Version Control

- **Version control** all agent definitions
- **Document safety rationale** for each constraint
- **Maintain change logs** for safety-critical modifications
- **Peer review** all safety system changes

## Deployment Checklist

Before deploying Agent-DSL systems:

### Pre-flight Verification

```bash
# 1. Verify code generation
./generate.zsh quad0
colcon build --symlink-install

# 2. Check safety configurations
ros2 param dump /quad0/safety_monitor > safety_verification.yaml

# 3. Test emergency procedures
ros2 service call /quad0/test_emergency_rtl

# 4. Validate geofencing
ros2 service call /quad0/test_geofence_boundary

# 5. Communication check
ros2 topic pub /test_communication std_msgs/String "data: 'test'"
```

### Field Deployment

1. **Start with reduced operational area**
2. **Test all emergency procedures**
3. **Validate communication range**
4. **Monitor safety system performance**
5. **Gradually expand operational envelope**

## Next Steps and Community

### Advanced Topics

- **Custom safety constraints** for specialized applications
- **Multi-domain operations** (air, ground, marine)
- **Integration with external systems** (air traffic control, weather services)
- **Machine learning** integration for adaptive behavior

### Contributing to Agent-DSL

- **Extend the grammar** for new agent types
- **Add safety constraint templates** for common scenarios  
- **Improve code generation** efficiency
- **Contribute simulation scenarios**

### Getting Help

- **Documentation**: Check the Agent-DSL wiki
- **Issues**: Report bugs and feature requests on GitHub
- **Community**: Join the Agent-DSL discussion forum
- **Support**: Contact the development team

---

## Conclusion: Your Complete Robot System

Congratulations! You now have the complete toolkit for building sophisticated, safe, and coordinated robot teams:

1. **TrajGenPy**: Efficient coverage path planning
2. **TrajAllocPy**: Intelligent multi-robot task allocation  
3. **SwarmTalk**: Reliable robot-to-robot communication
4. **SARenv**: Comprehensive testing and evaluation
5. **Agent-DSL**: Safe and intelligent operation management

This powerful combination enables you to tackle real-world robotics challenges with confidence, safety, and efficiency.

**Ready to deploy your intelligent robot team?** Start with simple missions and gradually build complexity as you gain experience with each component. The future of autonomous robotics is in your hands!
