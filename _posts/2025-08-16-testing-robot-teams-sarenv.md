---
title: "Evaluating Robot Teams with SARenv: Realistic Search and Rescue Scenarios"
date: 2025-08-13
permalink: /posts/2025/08/sarenv-guide/
tags:
  - search-and-rescue
  - dataset
  - evaluation
  - UAV
  - benchmarking
  - testing
classes: 
  - wide
---

## From Simulation to Reality: Testing Your Robot Teams

You've built robot teams that can plan paths, coordinate tasks, and communicate effectively. But how do you know they'll work in real-world scenarios? **SARenv** provides the answer - a comprehensive dataset and evaluation framework specifically designed for testing UAV-based search and rescue algorithms in realistic environments.

## Why SARenv Matters

### The Testing Challenge

Traditional robotics testing often uses:

- Simple geometric environments
- Unrealistic victim distributions  
- Limited terrain variety
- No standardized metrics

**SARenv solves these problems** by providing:

- Real geospatial data from diverse locations
- Scientifically-based lost person behavior models
- Standardized evaluation metrics
- Multiple difficulty levels for progressive testing

### Real-World Applications

SARenv scenarios are based on actual search and rescue operations:

- **Wilderness searches** for missing hikers
- **Disaster response** in urban environments
- **Maritime rescue** operations
- **Mountain rescue** in challenging terrain

## Understanding the SARenv Framework

### Core Components

1. **Environment Generation**: Creates realistic search areas with terrain features
2. **Lost Person Modeling**: Places victims based on statistical behavior models
3. **Algorithm Evaluation**: Standardized metrics for comparing approaches
4. **Baseline Algorithms**: Reference implementations for comparison

### Dataset Scales

| Scale | Radius (km) | Area (km²) | Use Case |
|-------|-------------|------------|----------|
| Small | 1.0 | ~3.14 | Algorithm development |
| Medium | 2.0 | ~12.57 | Comparative testing |
| Large | 4.0 | ~50.27 | Realistic scenarios |
| XLarge | 8.0 | ~201.06 | Challenging benchmarks |

## Installation and Setup

### Prerequisites

```bash
# Install Git LFS for dataset files
sudo apt-get install git-lfs  # Ubuntu/Debian
# OR
brew install git-lfs         # macOS

# Initialize Git LFS
git lfs install
```

### Installing SARenv

```bash
# Clone the repository
git clone https://github.com/your-repo/sarenv.git
cd sarenv

# Download pre-generated datasets
git lfs pull

# Install dependencies
pip install -r requirements.txt

# Install the package
pip install -e .
```

## Your First SARenv Experiment

### Quick Start: 5-Minute Test Run

The fastest way to see SARenv in action is to run a complete evaluation using pre-generated data:

```python
from sarenv.analytics.evaluator import ComparativeEvaluator

# Quick algorithm comparison using pre-generated data
evaluator = ComparativeEvaluator(
    dataset_directory="sarenv_dataset/19",
    evaluation_sizes=["medium"],
    num_drones=2,
    num_lost_persons=50,
    budget=200000,
)

# This runs all 5 algorithms and shows results
results, _ = evaluator.run_baseline_evaluations()
print("Algorithm performance:")
for name, scores in results.items():
    print(f"{name}: {scores['total_likelihood_score']:.2f}")

# Generate plots comparing all algorithms
evaluator.plot_results(results)
```

### Loading and Visualizing Environments

```python
from sarenv import DatasetLoader, visualize_heatmap, visualize_features

# Load and visualize probability maps
loader = DatasetLoader("sarenv_dataset/19")
item = loader.load_environment("medium")

# Show where lost persons are most likely to be found
visualize_heatmap(item, plot_inset=True)

# Show terrain features with lost persons
visualize_features(item, num_lost_persons=100)
```

### Understanding What You See

**Probability Heatmap**: Shows where lost persons are statistically likely to be found:

- **Red areas**: High probability zones (near trails, shelters)
- **Blue areas**: Low probability zones (cliffs, water)
- **Yellow areas**: Medium probability zones

**Feature Map**: Shows real-world terrain elements:

- **Brown lines**: Trails and paths
- **Blue areas**: Water bodies
- **Green areas**: Vegetation
- **Gray squares**: Structures/buildings

## Creating Custom Search Scenarios

### Generating Your Own Dataset

Want to test on a specific location? Generate a custom dataset from any geographic area:

```python
import shapely
from sarenv import (
    DataGenerator,
    CLIMATE_TEMPERATE,
    ENVIRONMENT_TYPE_FLAT,
)

# Initialize data generator
data_gen = DataGenerator()

# Define a custom polygon area (coordinates in longitude, latitude)
polygon_coords = [
    [10.280, 55.140],  # Southwest corner
    [10.300, 55.140],  # Southeast corner
    [10.300, 55.150],  # Northeast corner
    [10.280, 55.150],  # Northwest corner
    [10.280, 55.140],  # Close the polygon
]

custom_polygon = shapely.geometry.Polygon(polygon_coords)

# Generate dataset for the polygon area
data_gen.export_dataset_from_polygon(
    polygon=custom_polygon,
    output_directory="sarenv_dataset_custom",
    environment_climate=CLIMATE_TEMPERATE,
    environment_type=ENVIRONMENT_TYPE_FLAT,
    meter_per_bin=30,
)
```

### Generating Lost Person Scenarios

```python
from sarenv import LostPersonLocationGenerator

# Load environment
dataset_dir = "sarenv_dataset/19"
loader = DatasetLoader(dataset_directory=dataset_dir)
dataset_item = loader.load_environment("xlarge")

# Initialize lost person location generator
lost_person_generator = LostPersonLocationGenerator(dataset_item)

# Generate 100 lost person locations (0% random, 100% probability-based)
locations = lost_person_generator.generate_locations(
    num_locations=100,
    random_sample_ratio=0.0
)

print(f"Generated {len(locations)} realistic victim locations")
```

### Understanding Lost Person Modeling

The lost person model considers:

- **Distance from last known position** (search theory)
- **Terrain accessibility** (slopes, vegetation density)
- **Behavioral patterns** (tendency to follow paths vs. go cross-country)
- **Environmental attractors** (shelters, water sources)

## Testing Your Search Algorithms

### Built-in Search Algorithms for Comparison

SARenv includes five proven search algorithms that provide excellent baselines:

#### 🌀 Spiral Coverage

**Description**: Efficient outward spiral search patterns  
**Best for**: Systematic area coverage with minimal overlap

#### 🎯 Concentric Circles

**Description**: Ring-based search patterns with smooth transitions  
**Best for**: Radial search from known last position

#### 🍕 Pizza Zigzag

**Description**: Sector-based zigzag coverage ("pizza slices")  
**Best for**: Coordinated multi-drone searches

#### 🤖 Greedy Search

**Description**: Probability-driven adaptive search  
**Best for**: Informed search using terrain and behavioral models

#### 🎲 Random Walk

**Description**: Stochastic exploration baseline  
**Best for**: Baseline comparison and uncertainty handling

### Quick Algorithm Comparison

```python
from sarenv.analytics.evaluator import ComparativeEvaluator

# Evaluate all algorithms on the same dataset
evaluator = ComparativeEvaluator(
    dataset_directory="sarenv_dataset/19",
    evaluation_sizes=["medium"],
    num_drones=3,
    num_lost_persons=100,
    budget=300000,
)

# Run all baseline algorithms
results, time_series = evaluator.run_baseline_evaluations()

# Results include: Spiral, Concentric, Pizza, Greedy, RandomWalk
for algorithm, scores in results.items():
    print(f"{algorithm}: {scores['total_likelihood_score']:.2f}")

# Generate comparative plots
evaluator.plot_results(results)
```

### Integrating Your Custom Robot Team

Here's how to test your own search algorithms within the SARenv framework:

```python
import numpy as np
from shapely.geometry import LineString
from sarenv.analytics.evaluator import ComparativeEvaluator, PathGenerator

def custom_search_algorithm(center_x, center_y, max_radius, **kwargs):
    """
    Custom search algorithm implementation.
    
    Args:
        center_x, center_y: Search center coordinates (in meters)
        max_radius: Maximum search radius in meters
        num_drones: Number of UAVs
        **kwargs: Additional parameters (fov_deg, altitude, etc.)
    
    Returns:
        list[LineString]: Path for each drone
    """
    num_drones = kwargs.get("num_drones", 3)
    path_point_spacing_m = kwargs.get("path_point_spacing_m", 10.0)
    
    # Example: Create a straight line path
    num_points = int(max_radius * 2 / path_point_spacing_m)
    x_coords = np.linspace(center_x - max_radius, center_x + max_radius, num_points)
    y_coords = np.full_like(x_coords, center_y)
    
    full_path = LineString(zip(x_coords, y_coords))
    
    # Split path among multiple drones
    from sarenv.analytics.paths import split_path_for_drones
    return split_path_for_drones(full_path, num_drones)

# Create a PathGenerator object
custom_generator = PathGenerator(
    name="CustomStraightLine",
    func=custom_search_algorithm,
    description="Custom straight line path generator",
)

# Register with evaluator
evaluator = ComparativeEvaluator(
    dataset_directory="sarenv_dataset/19",
    evaluation_sizes=["medium"],
    num_drones=3,
    budget=300000,
)

# Add your custom algorithm to the evaluation
evaluator.path_generators['custom_straight'] = custom_generator

# Run evaluation including your custom algorithm
results, time_series = evaluator.run_baseline_evaluations()
```

## Understanding Evaluation Metrics and Configuration

### Key Parameters for Research

Understanding these parameters will help you customize evaluations for your research:

| Parameter | Description | Typical Values | Impact |
|-----------|-------------|---------------|---------|
| `num_drones` | Number of UAVs in search | 1-10 | More drones = faster coverage but coordination overhead |
| `budget` | Total search distance (meters) | 100,000-1,000,000 | Limits search scope, simulates real-world constraints |
| `num_lost_persons` | Number of victim locations | 25-500 | More victims = more robust statistics |
| `fov_degrees` | Camera field of view | 30-90° | Wider FOV = less precise coverage |
| `altitude_meters` | UAV flight altitude | 50-150m | Higher = larger coverage area per pass |

### Research-Focused Configuration Example

```python
# Configuration for detailed research analysis
evaluator = ComparativeEvaluator(
    dataset_directory="sarenv_dataset/19",
    evaluation_sizes=["medium", "large"],
    num_drones=5,              # Multi-drone coordination
    num_lost_persons=200,      # High statistical power
    budget=500000,             # Extended search capability
    fov_degrees=45.0,          # Balanced precision/coverage
    altitude_meters=80.0,      # Moderate altitude
    overlap_ratio=0.2,         # Good reliability
    discount_factor=0.999,     # Time importance
)
```

### Quick Testing Configuration

```python
# Configuration for fast iteration and testing
evaluator = ComparativeEvaluator(
    dataset_directory="sarenv_dataset/19",
    evaluation_sizes=["small"],
    num_drones=2,              # Simple coordination
    num_lost_persons=50,       # Faster execution
    budget=150000,             # Limited scope
    fov_degrees=60.0,          # Wider coverage
    altitude_meters=100.0,     # Higher efficiency
)
```

### Core Performance Metrics

The framework provides comprehensive metrics for algorithm evaluation:

**Total Likelihood Score**: Higher is better

- Measures how well your search covers high-probability areas
- Weighted by victim probability distribution
- Range: 0-100 (theoretical maximum)

**Time-Discounted Score**: Higher is better

- Accounts for urgency in search and rescue
- Earlier discoveries score higher
- Critical for time-sensitive operations

**Victim Detection Rate**: Higher is better

- Percentage of victims found
- Should be >90% for effective algorithms
- Balance with efficiency metrics

**Coverage Efficiency**: Area covered per unit time/distance

**Average Detection Distance**: Mean travel distance to victim discovery

## Multi-Dataset Evaluation for Robust Testing

### Testing Across Multiple Environments

For comprehensive algorithm validation, test across multiple datasets and environments:

```python
from sarenv.analytics.evaluator import ComparativeDatasetEvaluator

# Initialize multi-dataset evaluator
evaluator = ComparativeDatasetEvaluator(
    dataset_base_directory="sarenv_dataset",
    evaluation_sizes=["medium", "large"],
    num_drones=5,
    budget=300000,
)

# Run evaluations across all datasets
all_results = evaluator.run_all_evaluations()

# Generate comprehensive analysis plots
evaluator.plot_all_results(all_results)
```

### Single Dataset Focused Testing

For detailed analysis on a specific environment:

```python
# Evaluate algorithms on specific dataset and parameters
evaluator = ComparativeEvaluator(
    dataset_directory="sarenv_dataset/19",
    evaluation_sizes=["medium", "large"],
    num_drones=3,
    num_lost_persons=100,
    budget=350000,  # Search budget in meters
)

# Run baseline algorithm evaluations
baseline_results, time_series_data = evaluator.run_baseline_evaluations()

# Plot comparative results
evaluator.plot_results(baseline_results)
```

## Progressive Testing Strategy

### Phase 1: Algorithm Development (Small environments)

Start with quick tests to validate your basic algorithm functionality:

```python
# Quick testing configuration for development
dev_evaluator = ComparativeEvaluator(
    dataset_directory="sarenv_dataset/19",
    evaluation_sizes=["small"],
    num_drones=2,
    num_lost_persons=25,
    budget=100000,
)

# Run quick tests
quick_results, _ = dev_evaluator.run_baseline_evaluations()
print("Development phase results:")
for name, scores in quick_results.items():
    print(f"{name}: {scores['total_likelihood_score']:.2f}")
```

### Phase 2: Comparative Analysis (Medium environments)

Compare your algorithm against established baselines:

```python
# Research configuration for thorough comparison
research_evaluator = ComparativeEvaluator(
    dataset_directory="sarenv_dataset/19",
    evaluation_sizes=["medium"],
    num_drones=3,
    num_lost_persons=100,
    budget=300000,
)

# Add your custom algorithm
research_evaluator.path_generators['my_algorithm'] = my_custom_generator

# Run comprehensive evaluation
results, time_series = research_evaluator.run_baseline_evaluations()

# Analyze statistical significance
baseline_scores = [r['total_likelihood_score'] for name, r in results.items() 
                   if name != 'my_algorithm']
my_scores = results['my_algorithm']['total_likelihood_score']
print(f"My algorithm vs baseline average: {my_scores:.2f} vs {np.mean(baseline_scores):.2f}")
```

### Phase 3: Stress Testing (Large/XLarge environments)

Test scalability and robustness on challenging scenarios:

```python
# Stress test configuration
stress_configs = [
    {'size': 'large', 'drones': 5, 'victims': 100, 'budget': 500000},
    {'size': 'xlarge', 'drones': 8, 'victims': 200, 'budget': 800000},
]

stress_results = {}
for config in stress_configs:
    evaluator = ComparativeEvaluator(
        dataset_directory="sarenv_dataset/19",
        evaluation_sizes=[config['size']],
        num_drones=config['drones'],
        num_lost_persons=config['victims'],
        budget=config['budget'],
    )
    
    results, _ = evaluator.run_baseline_evaluations()
    stress_results[f"{config['size']}_{config['drones']}drones"] = results
    print(f"Stress test {config['size']}: completed")
```

## Advanced Features and Use Cases

### Advanced Custom Algorithm Integration

For algorithms that need probability awareness or complex coordination:

```python
def probability_aware_algorithm(center_x, center_y, max_radius, **kwargs):
    """
    Advanced algorithm that uses probability information.
    """
    num_drones = kwargs.get("num_drones", 3)
    
    # Access additional context if available
    heatmap = kwargs.get("heatmap", None)  # Probability heatmap
    bounds = kwargs.get("bounds", None)    # Geographic bounds
    
    # Your advanced algorithm logic here using the heatmap
    # to guide the search pattern toward high-probability areas
    
    paths = []
    for i in range(num_drones):
        # Create probability-guided paths for each drone
        prob_guided_path = create_probability_guided_path(
            center_x, center_y, max_radius, heatmap, i
        )
        paths.append(prob_guided_path)
    
    return paths

def create_probability_guided_path(center_x, center_y, max_radius, heatmap, drone_id):
    """Helper function to create paths guided by probability maps."""
    # Implementation depends on your specific algorithm
    # This is where you'd use the heatmap data to guide path planning
    pass
```

### Testing Different Team Configurations

```python
# Test various drone team compositions
team_configs = [
    {'config': 'small_team', 'drones': 2, 'budget': 200000},
    {'config': 'balanced_team', 'drones': 4, 'budget': 350000},
    {'config': 'large_team', 'drones': 8, 'budget': 600000},
]

config_results = {}
for config in team_configs:
    evaluator = ComparativeEvaluator(
        dataset_directory="sarenv_dataset/19",
        evaluation_sizes=["medium"],
        num_drones=config['drones'],
        budget=config['budget'],
        num_lost_persons=100,
    )
    
    results, _ = evaluator.run_baseline_evaluations()
    config_results[config['config']] = results
    
    print(f"Team config {config['config']}: "
          f"Best score: {max(r['total_likelihood_score'] for r in results.values()):.2f}")
```

### Performance Analysis and Optimization

```python
def analyze_algorithm_performance(results_dict):
    """Comprehensive performance analysis across multiple configurations."""
    
    analysis = {}
    for config_name, results in results_dict.items():
        analysis[config_name] = {}
        
        for algo_name, scores in results.items():
            # Calculate key performance indicators
            analysis[config_name][algo_name] = {
                'likelihood_score': scores['total_likelihood_score'],
                'time_score': scores.get('time_discounted_score', 0),
                'detection_rate': scores.get('victim_detection_rate', 0),
                'efficiency': scores.get('coverage_efficiency', 0)
            }
    
    # Find best performing algorithm across configurations
    best_overall = max(
        [(config, algo, metrics['likelihood_score']) 
         for config, algos in analysis.items() 
         for algo, metrics in algos.items()],
        key=lambda x: x[2]
    )
    
    print(f"🏆 Best performing: {best_overall[1]} in {best_overall[0]} "
          f"(score: {best_overall[2]:.2f})")
    
    return analysis
```

## Best Practices for SARenv Testing

### 1. Systematic Evaluation Approach

- **Start simple**: Use small environments for initial development
- **Progress gradually**: Increase complexity systematically  
- **Multiple runs**: Test each configuration 10+ times for statistical validity
- **Control variables**: Change one parameter at a time

### 2. Realistic Parameter Settings

Model real-world constraints in your testing:

```python
# Example realistic constraints
realistic_params = {
    'battery_life_minutes': 25,
    'communication_range_meters': 200,
    'sensor_range_meters': 50,
    'max_speed_ms': 15,
    'weather_limits': ['clear', 'light_wind'],
    'altitude_constraints': {'min': 50, 'max': 150},  # meters
    'overlap_ratio': 0.2,  # 20% path overlap for reliability
}

# Apply constraints in evaluation
evaluator = ComparativeEvaluator(
    dataset_directory="sarenv_dataset/19",
    evaluation_sizes=["medium"],
    num_drones=3,
    budget=realistic_params['battery_life_minutes'] * 60 * realistic_params['max_speed_ms'],
    altitude_meters=100,
    overlap_ratio=realistic_params['overlap_ratio'],
)
```

### 3. Comprehensive Performance Tracking

```python
import json
from datetime import datetime

class ExperimentTracker:
    def __init__(self):
        self.experiments = []
        
    def log_experiment(self, config, results, notes=""):
        """Log a complete experiment for later analysis."""
        experiment = {
            'timestamp': datetime.now().isoformat(),
            'configuration': config,
            'results': results,
            'notes': notes,
            'dataset_info': {
                'dataset_dir': config.get('dataset_directory'),
                'sizes': config.get('evaluation_sizes'),
                'num_drones': config.get('num_drones'),
                'budget': config.get('budget')
            }
        }
        self.experiments.append(experiment)
        
    def save_results(self, filename):
        """Save all experiments to a JSON file."""
        with open(filename, 'w') as f:
            json.dump(self.experiments, f, indent=2)
            
    def generate_summary(self):
        """Generate a summary of all experiments."""
        if not self.experiments:
            print("No experiments logged yet.")
            return
            
        print(f"📊 Experiment Summary ({len(self.experiments)} experiments)")
        
        # Find best performing configuration
        best_exp = max(self.experiments, 
                      key=lambda x: max(r.get('total_likelihood_score', 0) 
                                       for r in x['results'].values()))
        
        best_algo = max(best_exp['results'].items(), 
                       key=lambda x: x[1].get('total_likelihood_score', 0))
        
        print(f"🏆 Best result: {best_algo[0]} with score {best_algo[1]['total_likelihood_score']:.2f}")
        print(f"   Configuration: {best_exp['configuration']['num_drones']} drones, "
              f"budget {best_exp['configuration']['budget']}")

# Usage example
tracker = ExperimentTracker()

# Run experiments and track results
for drone_count in [2, 3, 5]:
    config = {
        'dataset_directory': 'sarenv_dataset/19',
        'evaluation_sizes': ['medium'],
        'num_drones': drone_count,
        'budget': 300000,
        'num_lost_persons': 100
    }
    
    evaluator = ComparativeEvaluator(**config)
    results, _ = evaluator.run_baseline_evaluations()
    
    tracker.log_experiment(config, results, f"Testing {drone_count} drone configuration")

# Analyze all results
tracker.generate_summary()
tracker.save_results('sarenv_experiments.json')
```

## Integration with Your Complete Robot Stack

### Connecting SARenv with Real Robot Systems

Here's how to bridge SARenv testing with your actual robot implementations:

```python
# Example integration with your robot control stack
class SARenvIntegration:
    def __init__(self, sarenv_evaluator):
        self.evaluator = sarenv_evaluator
        self.robot_controller = None  # Your robot controller
        
    def test_integrated_system(self, dataset_item):
        """Test your complete robot stack using SARenv scenarios."""
        
        # 1. Generate realistic victim locations
        victim_gen = LostPersonLocationGenerator(dataset_item)
        victims = victim_gen.generate_locations(num_locations=3)
        
        # 2. Plan search using your integrated stack
        # (TrajGenPy + TrajAllocPy + SwarmTalk + your planning)
        search_plan = self.plan_integrated_search(dataset_item, victims)
        
        # 3. Evaluate using SARenv metrics
        results = self.evaluator.evaluate_paths(search_plan)
        
        return results
    
    def plan_integrated_search(self, environment, victims):
        """Use your complete robot stack for planning."""
        # This would integrate:
        # - TrajGenPy for path generation
        # - TrajAllocPy for task allocation
        # - SwarmTalk for communication protocols
        # - Your custom search algorithms
        pass

# Example usage
integration = SARenvIntegration(evaluator)
loader = DatasetLoader("sarenv_dataset/19")
env = loader.load_environment("medium")

integrated_results = integration.test_integrated_system(env)
print(f"Integrated system performance: {integrated_results['total_likelihood_score']:.2f}")
```

### Simulation Bridge Example

```python
# Bridge SARenv with simulation environments (Gazebo, AirSim, etc.)
class SimulationBridge:
    def __init__(self, simulator_interface):
        self.simulator = simulator_interface
        
    def run_sarenv_scenario_in_simulation(self, sarenv_environment, search_paths):
        """Execute SARenv test scenarios in your simulator."""
        
        # 1. Convert SARenv environment to simulation world
        sim_world = self.convert_environment_to_simulation(sarenv_environment)
        
        # 2. Spawn robots in simulation
        robot_ids = self.simulator.spawn_robot_team(len(search_paths))
        
        # 3. Execute search paths
        execution_results = []
        for robot_id, path in zip(robot_ids, search_paths):
            result = self.simulator.execute_path(robot_id, path)
            execution_results.append(result)
            
        # 4. Collect simulation metrics
        sim_metrics = self.collect_simulation_data(execution_results)
        
        return sim_metrics
        
    def convert_environment_to_simulation(self, sarenv_env):
        """Convert SARenv geographic data to simulation format."""
        # Implementation depends on your specific simulator
        pass
```

## Quick Start Summary

Here's everything you need to get started with SARenv in 5 minutes:

1. **Installation**:

   ```bash
   git clone https://github.com/your-repo/sarenv.git
   cd sarenv
   git lfs pull  # Download datasets
   pip install -e .
   ```

2. **Quick Test**:

   ```python
   from sarenv.analytics.evaluator import ComparativeEvaluator
   
   evaluator = ComparativeEvaluator(
       dataset_directory="sarenv_dataset/19",
       evaluation_sizes=["medium"],
       num_drones=2,
       num_lost_persons=50,
       budget=200000,
   )
   
   results, _ = evaluator.run_baseline_evaluations()
   evaluator.plot_results(results)
   ```

3. **Add Your Algorithm**:

   ```python
   from sarenv.analytics.evaluator import PathGenerator
   
   def my_search_algorithm(center_x, center_y, max_radius, **kwargs):
       # Your algorithm implementation
       return [path1, path2, ...]  # List of LineString paths
   
   custom_gen = PathGenerator("MyAlgorithm", my_search_algorithm, "My custom search")
   evaluator.path_generators['my_algo'] = custom_gen
   ```

## Next Steps and Advanced Topics

Now that you understand SARenv testing:

1. **Start with baseline comparisons** to establish performance benchmarks
2. **Test your integrated robot stack** (TrajGenPy + TrajAllocPy + SwarmTalk)
3. **Develop custom scenarios** for your specific research applications
4. **Run multi-dataset evaluations** for robust validation
5. **Contribute improvements** to the SARenv framework

### What's Next?

In our next and final post in this series, we'll explore **Agent-DSL** - a domain-specific language for defining autonomous agent behavior, safety protocols, and complex operation planning that ties together all the tools we've covered.

**Ready to scientifically validate your search and rescue algorithms?** Start with small environments, establish baselines, then progressively test more complex scenarios. SARenv provides the rigorous testing framework your research deserves.
