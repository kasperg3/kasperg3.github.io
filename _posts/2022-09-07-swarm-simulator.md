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


**cohesion:**

$$c_i=\sum_{v_j \in V_i} \frac{p_j}{m}$$

**allignment:**

$$\vec{m}_i=\sum_{v b_j \in v_i} \frac{\vec{v}_j}{m}$$

$$\vec{k}_i=c_i-p_i$$

**Separation:**

$$\vec{s}_i=-\sum_{\forall \mathbf{b}_j \in v_i}\left(p_i-p_j\right)$$


<figure class="third">
	<img src="/assets/posts/swarm-simulator/cohesion.png">
	<img src="/assets/posts/swarm-simulator/separation.png">
	<img src="/assets/posts/swarm-simulator/alignment.gif">
	<figcaption>Boid algorithm components</figcaption>
</figure>
<figure class="third">
	<img src="/assets/posts/swarm-simulator/neighborhood.gif">
	<figcaption>Boid algorithm components</figcaption>
</figure>

TODO Ref the figures, papers and libraries used!

## Conclusion
All in all, the 