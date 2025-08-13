---
title: "Multi-Robot Coordination with TrajAllocPy: From Solo to Swarm"
date: 2025-08-13
permalink: /posts/2025/08/trajallocpy-guide/
tags:
  - multi-robot
  - task-allocation
  - swarm-robotics
  - python
  - CBBA
classes: 
  - wide
---

## From Single Robot to Robot Teams

In our previous post, we explored how TrajGenPy helps individual robots plan efficient coverage paths. But what happens when you have multiple robots? How do they decide who goes where? This is where **TrajAllocPy** shines - it enables teams of robots to work together intelligently using the Consensus Based Bundle Algorithm (CBBA).

## The Multi-Robot Challenge

Consider a search and rescue scenario:

- **Area**: 10 square kilometers of wilderness
- **Team**: 3 search drones
- **Mission**: Find missing hikers as quickly as possible

Without coordination, robots might:

- Cover the same areas multiple times (inefficient)
- Leave gaps in coverage (dangerous)
- Waste battery on poor route choices
- Interfere with each other's operations

TrajAllocPy solves these problems through **decentralized task allocation** - each robot makes smart decisions that benefit the entire team.

## Understanding CBBA: The Smart Auction

Think of CBBA like a sophisticated auction system:

1. **Tasks are announced**: "We need to search sector A, B, and C"
2. **Robots bid**: Each robot calculates how efficiently it can complete each task
3. **Winners are selected**: The best robot for each task gets the assignment
4. **Consensus is reached**: All robots agree on the final plan

The beauty? This happens without a central commander - robots negotiate directly with each other.

## Setting Up Your First Multi-Robot Team

### Installation and Prerequisites

```bash
# Install TrajAllocPy
pip install trajallocpy

# Required dependencies (usually auto-installed)
pip install numpy shapely matplotlib geojson
```

### Basic Team Setup

Let's start with a simple three-robot team:

```python
import numpy as np
from trajallocpy import Agent, CoverageProblem, Experiment, Task
import shapely

# Set seed for reproducible results
np.random.seed(123)

# Step 1: Define your mission area
search_area = shapely.geometry.Polygon([
    (0, 0), (100, 0), (100, 100), (0, 100)
])

# Step 2: Add obstacles (buildings, no-fly zones, etc.)
obstacles = shapely.geometry.MultiPolygon([
    shapely.geometry.Polygon([(20, 20), (40, 20), (40, 40), (20, 40)]),
    shapely.geometry.Polygon([(60, 60), (80, 60), (80, 80), (60, 80)])
])

# Step 3: Define tasks (areas to search or routes to follow)
tasks = [
    Task.TrajectoryTask(0, shapely.geometry.LineString([(10, 10), (15, 15)]), reward=100),
    Task.TrajectoryTask(1, shapely.geometry.LineString([(50, 30), (70, 35)]), reward=100),
    Task.TrajectoryTask(2, shapely.geometry.LineString([(30, 70), (45, 85)]), reward=100),
    Task.TrajectoryTask(3, shapely.geometry.LineString([(80, 10), (90, 20)]), reward=100),
    Task.TrajectoryTask(4, shapely.geometry.LineString([(10, 80), (20, 90)]), reward=100),
]

print(f"Mission: {len(tasks)} tasks for our robot team")
```

### Creating Your Robot Team

```python
# Step 4: Create your robot agents
agents = [
    Agent.config(
        id=0,
        start_pos=[(10, 50)],    # Starting position
        capacity=500,             # Maximum travel distance
        max_velocity=10          # Speed in m/s
    ),
    Agent.config(
        id=1,
        start_pos=[(50, 10)],
        capacity=500,
        max_velocity=10
    ),
    Agent.config(
        id=2,
        start_pos=[(90, 90)],
        capacity=500,
        max_velocity=10
    ),
]

print(f"Team assembled: {len(agents)} robots ready for deployment")
```

### Running the Mission

```python
# Step 5: Create the coverage problem
coverage_problem = CoverageProblem.CoverageProblem(
    restricted_areas=obstacles,
    search_area=search_area,
    tasks=tasks
)

# Step 6: Set up and run the experiment
experiment = Experiment.Runner(
    coverage_problem=coverage_problem,
    enable_plotting=True,  # Watch the magic happen!
    agents=agents
)

# Step 7: Solve the allocation problem
print("Starting mission planning...")
experiment.solve()

# Step 8: Analyze results
compute_time, iterations, path_lengths, task_lengths, path_costs, rewards, routes, max_cost = experiment.evaluateSolution()

print(f"\n🎯 Mission Plan Complete!")
print(f"⏱️  Planning time: {compute_time:.3f} seconds")
print(f"🔄 Algorithm iterations: {iterations}")
print(f"📏 Total distance: {sum(path_lengths.values()):.1f} meters")
print(f"🏆 Total mission value: {sum(rewards.values()):.0f} points")

# Show individual robot assignments
for agent_id, route_length in path_lengths.items():
    print(f"🤖 Robot {agent_id}: {route_length:.1f}m route, {rewards[agent_id]:.0f} points")
```

## Understanding the Results

When you run this code, you'll see:

### Real-time Visualization

- **Colored areas**: Mission boundaries and obstacles
- **Lines**: Task trajectories to be completed
- **Paths**: Each robot's assigned route (different colors)
- **Animation**: How the allocation evolves over iterations

### Performance Metrics

The algorithm optimizes several factors:

- **Load balancing**: No single robot is overworked
- **Travel efficiency**: Minimize unnecessary movement
- **Task completion**: Maximize mission value
- **Fairness**: Equitable task distribution

## Advanced Configuration

### Heterogeneous Teams

Real robot teams aren't identical. Configure different capabilities:

```python
# Specialized team: Fast scout, heavy lifter, precision operator
agents = [
    Agent.config(0, [(0, 0)], capacity=300, max_velocity=15),    # Fast scout
    Agent.config(1, [(50, 0)], capacity=800, max_velocity=8),   # Heavy lifter  
    Agent.config(2, [(100, 0)], capacity=400, max_velocity=12), # Balanced
]
```

### Priority Tasks

Some tasks are more important than others:

```python
tasks = [
    Task.TrajectoryTask(0, trajectory, reward=200),  # High priority
    Task.TrajectoryTask(1, trajectory, reward=100),  # Normal priority
    Task.TrajectoryTask(2, trajectory, reward=50),   # Low priority
]
```

### Dynamic Constraints

Add time constraints or special requirements:

```python
# Tasks with deadlines or special equipment needs
# (Check documentation for advanced constraint options)
```

## Best Practices for Multi-Robot Operations

### 1. Start Small, Scale Up

- Begin with 2-3 robots
- Add more agents as you understand the behavior
- Monitor performance degradation with team size

### 2. Balance Team Composition

- **Too similar**: Inefficient specialization
- **Too different**: Communication and coordination challenges
- **Sweet spot**: Complementary capabilities

### 3. Mission Design

- **More tasks than robots**: Better optimization opportunities
- **Appropriate task size**: Match robot capabilities
- **Spatial distribution**: Avoid clustering all tasks in one area

### 4. Performance Tuning

```python
# Monitor these key metrics:
efficiency_ratio = sum(task_lengths.values()) / sum(path_lengths.values())
load_balance = max(path_costs.values()) / (sum(path_costs.values()) / len(agents))

print(f"Efficiency: {efficiency_ratio:.2%}")  # Higher is better
print(f"Load balance: {load_balance:.2f}")    # Closer to 1.0 is better
```

## Real-World Applications

### Search and Rescue

- **Multiple drones** cover large wilderness areas
- **Priority zones** near last known locations
- **Time-critical** mission requirements

### Agricultural Monitoring

- **Fleet of sensors** monitor crop health
- **Specialized equipment** for different crop types
- **Seasonal optimization** for varying field conditions

### Infrastructure Inspection

- **Mixed teams** of aerial and ground robots
- **Sequential tasks** requiring specific order
- **Safety constraints** in industrial environments

## Troubleshooting Common Issues

### Problem: Poor Load Balancing

**Symptoms**: One robot does all the work
**Solution**: Adjust capacity constraints or task distribution

### Problem: No Solution Found

**Symptoms**: Algorithm doesn't converge
**Solution**: Check that tasks are reachable and capacity constraints are reasonable

### Problem: Inefficient Routes

**Symptoms**: Robots cross paths frequently
**Solution**: Better initial positioning or task clustering

## Integration with TrajGenPy

Combine both libraries for complete coverage missions:

```python
# 1. Use TrajGenPy to generate coverage tasks from areas
# 2. Use TrajAllocPy to assign tasks to robot team
# 3. Execute coordinated coverage mission

# This integration will be covered in our next advanced tutorial!
```

## Next Steps

Now that you understand multi-robot coordination:

1. **Experiment** with different team sizes and compositions
2. **Try real coordinates** using GeoJSON data
3. **Combine** with TrajGenPy for complete coverage solutions
4. **Learn about communication** requirements (our next topic: SwarmTalk)

In our next post, we'll explore **SwarmTalk** - the communication backbone that makes real robot coordination possible in the field.

---

**Ready to deploy your robot team?** Start with small scenarios and gradually increase complexity. Share your multi-robot success stories and challenges!
