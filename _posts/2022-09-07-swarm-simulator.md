---
title: "Swarm Simulator"
categories:
  - blog
tags:
  - update
classes: 
  - wide
---

When working with multi-agent systems and swarms in particular simulation is key to determine the behaviour of the agent, as well as observe emergent behaviours. 

Therefore a simple and efficient simulator is very useful to quickly do experiments.
In this post i will demonstrate how to easily implement a simple swarm algorithm known as Boids, which simulates the behaviour of birds using a couple of simple rules. 



## The framework
The swarm simulator framework is currently under development, but for now the four main classes that the user will extend is the following: 

**Environment**, Obstacles, environment configurations and features
**Robot**, the agent logic
**Widget**, the custom ui components, which can link variables from the ui to the environment or the agents
**SwarmSimulator**, is the class that brings it all together and is orchestrating the rendering, stepping the simulator.

Below, you can see the simplicity of starting a simulation using a basic implementation of boids. 
Notice that no environment are provided, and therefore will use the default environment, which is empty. The environment can be created by extending Environment and constructing the SwarmSimulator class using that.

```cpp
int main(void)
{
    // Instanciate your robot implementation
    std::list<SwarmSim::Robot *> robots;
    for (size_t i = 0; i < 250; i++)
    {
        robots.emplace_back(new SwarmSim::Boids());
    }

    // Custom property menu
    std::list<SwarmSim::Widget *> widgetList;
    SwarmSim::Widget *menu = new SwarmSim::PropertyPanel();
    widgetList.push_back(menu);

    // Construct the simulator and start the simulation loop
    SwarmSim::SwarmSimulator sim(false, robots, widgetList);

    sim.loop();
    return 0;
}
```

## UI and Environment
The UI framework used in this simulator is ImGui running on OpenGL and a middleware called RayLib(Game engine for making simple rendering easy). 
ImGui is a immediate mode GUI which means that the ui is rendered every frame, this is especially nice for handling applications that has to be responsive. 

At the moment, the only pre implemented ui components is a menu and a variable slider, to control environment variable. This is easily extendible, if more complex ui components are needed.


## Boids implementation
The boids implementation is quite simple and contains three core equations that defines the behaviours:


```cpp
class Boids : public Robot
{
public:
  Boids();
  ~Boids();

  void sense(std::shared_ptr<SwarmSim::EnvironmentState>) override;
  void act() override;
  void draw() override;
}
```
To describe the Boids equations, we need to understand the concept of Boids. Boids is an artificial life program that simulates the flocking behavior of birds. It was developed by Craig Reynolds in 1986 and has since been used in various applications, including computer graphics, robotics, and simulation.

The Boids model defines three main rules that govern the behavior of individual agents (or "boids") within a flock:

Separation: Each boid tries to maintain a minimum distance from its neighbors to avoid collisions. This rule ensures that boids do not get too close to each other and helps prevent overcrowding.

Alignment: Each boid tries to align its velocity with the average velocity of its neighbors. This rule promotes cohesion within the flock and ensures that boids move in a similar direction.

Cohesion: Each boid tries to move towards the center of mass of its neighbors. This rule encourages boids to stay together as a group and prevents them from getting too dispersed.

These three rules are typically implemented using mathematical equations that calculate the desired velocity of each boid based on its current position and the positions of its neighbors. The equations can be summarized as follows:

Separation equation:

$$\vec{s}_i=-\sum_{\forall \mathbf{b}_j \in v_i}\left(p_i-p_j\right)$$

Calculate the separation vector by summing the normalized vectors pointing away from nearby boids.
Scale the separation vector by a separation factor to control the strength of the separation behavior.
Add the separation vector to the boid's current velocity.
Alignment equation:
$$\vec{m}_i=\sum_{v b_j \in v_i} \frac{\vec{v}_j}{m}$$

$$\vec{k}_i=c_i-p_i$$
Calculate the average velocity vector of nearby boids.
Scale the average velocity vector by an alignment factor to control the strength of the alignment behavior.
Add the scaled average velocity vector to the boid's current velocity.
Cohesion equation:

$$c_i=\sum_{v_j \in V_i} \frac{p_j}{m}$$

Calculate the center of mass (centroid) of nearby boids.
Calculate the vector pointing from the boid's current position to the centroid.
Scale the centroid vector by a cohesion factor to control the strength of the cohesion behavior.
Add the scaled centroid vector to the boid's current velocity.
By applying these equations to each boid in the flock, you can simulate the emergent behavior of flocking, where boids exhibit collective motion patterns such as alignment, cohesion, and separation.

It's important to note that the specific implementation of these equations may vary depending on the programming language and framework you are using. The equations provided here are a general representation of the Boids model and can be adapted to fit your specific project requirements.

![Swarm Simulator GIF](path/to/your/gif.gif)

## Conclusion
In conclusion, Swarm Simulator presents a versatile platform for studying multi-agent systems, enabling users to explore various algorithms and observe emergent behaviors within simulated environments. By leveraging this framework, researchers and developers can gain insights into swarm intelligence and its applications across diverse domains.

[Check out the code at my GitHub](https://github.com/kasperg3/swarm-simulator)
