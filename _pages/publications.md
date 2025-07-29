---
permalink: /publications/
title: "Publications"
classes: 
  - wide
  - small
categories:
  - blog
toc: false
---

You can also find me on <a href="https://scholar.google.com/citations?user=NuJ_4VAAAAAJ&hl" target="_blank"><font color="brown">Google Scholar</font></a>.

## Publications

### 2025

<details>
    <summary>Kasper Andreas Rømer Grøntved, Alejandro Jarabo-Peñas, Sid Reid, Edouard George Alain Rolland, Matthew Watson, Arthur Richards, Steve Bullock and Anders Lyhne Christensen, <b>SAREnv: An Open-Source Dataset and Benchmark Tool for Informed Wilderness Search and Rescue using UAVs</b>; 2025 International Conference on Unmanned Aircraft Systems (ICUAS)
    </summary>
    <br>
    <b>Abstract:</b> Unmanned Aerial Vehicles~(UAVs) play an increasingly vital role in wilderness Search and Rescue~(SAR) operations by enhancing situational awareness and extending the capabilities of human teams. Yet, a lack of standardized benchmarks has impeded the systematic evaluation of single- and multi-agent path-planning algorithms. This paper introduces an open-source dataset and evaluation framework to address this gap. The framework comprises 60 geospatial scenarios across four distinct European environments, featuring high-resolution probability maps. We present a lost person probabilistic model derived from statistical models of lost person behavior. We provide a suite of tools for evaluating search paths against five baseline methods: Spiral, Concentric Circles, Pizza Zigzag, Greedy, and Random Exploration, using three quantitative metrics: Accumulated Probability of Detection, Time-Discounted Probability of Detection, and Lost Person Discovery Score. We provide an evaluation framework to facilitate the comparative analysis of single- and multi-agent path planning algorithms, supporting both the baseline methods presented and custom user-defined path generators. By providing a structured and extensible framework, this work establishes a foundation for the rigorous and reproducible assessment of UAV search strategies in complex wilderness environments.
</details>
<br>

<details>
    <summary>Kasper A. R. Grøntved, Robert Ladigl and Anders Lyhne Christensen, <b>Communication for UAV Swarms: an Open-source, Low-cost Solution Based on ESP-NOW</b>; 2025 International Conference on Unmanned Aircraft Systems (ICUAS)
    </summary>
    <br>
    <b>Abstract:</b> Multi-UAV systems typically require complex infrastructure to deploy in real-world scenarios, limiting their accessibility and scalability. In addition, current research often relies on custom solutions or proprietary hardware to facilitate inter-UAV communication. In this paper, we propose an open-source, low-cost, plug-and-play solution to enable decentralized UAV-to-UAV communication over 2.4GHz Wi-Fi using a connectionless protocol. Our approach simplifies the deployment of decentralized systems by allowing UAVs to easily exchange any type of binary data, seamlessly interfacing with ROS2. The solution uses an ad-hoc style network that allows UAVs to join or leave dynamically without requiring centralized governance or a priori configuration. We describe the architecture of the system, assess the network performance in an outdoor environment using UAVs, and evaluate the system's ability to share information as a swarm through hardware-in-the-loop (HITL) and experiments using UAVs. Our results show that the proposed system facilitates connectivity and is able to transmit mission-critical data for real-world UAV operations. HITL experiments show that a decentralized planning algorithm running on three simulated UAVs can effectively reach consensus on decentralized task allocation. We have made the code public and thus provide a viable solution for researchers seeking to implement decentralized UAV swarms using cost-effective commercial-off-the-shelf (COTS) hardware and minimal infrastructure.
</details>
<br>

### 2024

<details>
    <summary>Kasper A. R. Grøntved, Maria-Therese Bahodi and Anders Lyhne Christensen, <b> Automated Task Generation for Multi-Drone Search and Rescue Operations</b>; Distributed Computing and Artificial Intelligence, 21st International Conference
    </summary>
    <br>
    <b>Abstract:</b>Drones are currently an indispensable tool for emergency response teams performing wilderness Search And Rescue (SAR), as they can cover large and possibly inaccessible areas efficiently. It is, however, still unclear how a drone operator can effectively engage and control a system composed of multiple autonomous robots, especially in unstructured and outdoor environments. This paper reports on ongoing work in the project HERD --- Human-AI Collaboration: Engaging and Controlling Swarms of Robots and Drones [6], in which we focus on how to enable an operator to control multi-drone systems.We present a tool for generating tasks and plans for multiple drones in wilderness SAR scenarios. The central aspect of our approach is to improve the search quality by automatically generating tasks to ensure timely coverage of high-risk areas, such as ditches, lake/sea banks, and beneath tree lines, where distressed people are likely to be found.
</details>
<br>

<details>
    <summary>Edouard G. A. Rolland and Kasper A. R. Grøntved and Anders Lyhne Christensen and Matthew Watson and Tom Richardson, <b>Autonomous UAV Volcanic Plume Sampling Based on Machine Vision and Path Planning</b>; 2024 International Conference on Unmanned Aircraft Systems (ICUAS)
    </summary>
    <br>
    <b>Abstract: </b>Drones currently serve as a valuable tool for in-situ sampling of volcanic plumes, but they still involve manual piloting. In this paper, we enable autonomous dual plume sampling by using a machine vision model to detect eruptions. When an eruption is detected, a sampling trajectory is automatically generated to intercept the plume twice to collect comparative samples. The machine vision model is developed by training a YOLOv8 object detection model thanks to a database of 1505 images that feature labelled plumes. The obtained average precision value of the model's plume class, at 90.7%, is comparable to that of state-of-the-art models for wildfire smoke monitoring. The performance of this method is assessed using a software-in-the-loop simulation of the drone and a simulated plume model. Although the results confirm the efficacy of using a machine vision model for triggering an onboard path-planning algorithm, it also suggests the potential for a hybrid strategy that integrates visual servoing with our proposed path-planning approach.
</details>
<br>

<details>
    <summary>Kasper A. R. Grøntved and Jes Hundevadt Jepsen and Anders Lyhne Christensen and Kjeld Jensen and Ulrik Pagh Schultz Lundquist and Miguel Campusano, <b>Towards Autonomous Multi-UAV U-space Operation Planning</b>; 2024 International Conference on Unmanned Aircraft Systems (ICUAS)
    </summary>
    <br>
    <b>Abstract: </b>One of the main challenges in the real-world adoption of multi-Uncrewed Aerial Vehicle (UAV) systems lies in the specification of operations and the management of dynamic tasks in varied operational contexts. In this paper, we propose a multi-UAV planning architecture to reduce the level of specialized expertise necessary for handling multi-UAV systems. Furthermore, this work is the first step towards designing a multi-UAV planning architecture that integrates with the U-space services specified in EU regulatory 2021/664. We propose two declarative languages: (i) an Agent-Language for expressing mitigation and safety objectives for individual UAVs, and (ii) an Operation-Language to enable users to plan high-level multi-UAV operations based on the available resources. The languages enable automatic on-the-fly re-planning if any UAVs abort the mission unexpectedly. The initial result of the multi-UAV planning architecture is showcased in three simulated UAVs running as Software-In-The-Loop (SITL), to demonstrate its capabilities.
</details>
<br>

### 2023 
<details>
    <summary>Kasper A. R. Grøntved, U. P. Schultz, and A. L. Christensen, <b>Decentralized multi-uav trajectory task allocation in search and rescue applications</b>; 21st International Conference on Advanced Robotics, IEEE 2023</summary>
    <br>
    <b>Abstract:</b> Multi-UAV systems have significant potential to enhance search and rescue~(SAR) operations, since a search area can be covered faster than current approaches when multiple UAVs operate in parallel. While recent advancements within the field of multi-robot coverage planning have yielded promising results, current algorithms are predominately centralized. In this paper, we present a generalization of the well-known decentralized consensus-based bundle algorithm~(CBBA), that enables efficient task allocation in multi-UAV SAR operations. The generalized algorithm considers tasks as trajectories between two points where the traversal direction for each task is optimized in the task allocation process. We carry out a series of simulation-based experiments on benchmark problems and compare our results to a state-of-the-art centralized solution. We find that our novel decentralized approach yields times to completion similar to those achieved with a centralized coverage path planning approach, with only $1.9\%$ overhead cost. We furthermore find that our approach performs $6\%$ better than point allocations while scaling well with the number of UAVs involved in the search effort.
</details>

### 2022

<details>
    <summary>Anders Lyhne Christensen, Kasper Andreas Rømer Grøntved, Maria-Theresa Oanh Hoang, Niels van Berkel, Mikael Skov, Alea Scovill, Gareth Edwards, Kenneth Richard Geipel, Lars Dalgaard, Ulrik Pagh Schultz Lundquist, Ioanna Constantiou, Christiane Lehrer, Timothy Merritt, <b>The HERD Project: Human-Multi-Robot Interaction in Search & Rescue and in Farming</b>;   in Adjunct Proceedings of the IEEE/RSJ International Conference on Intelligent Robots and Systems, 2022</summary>
    <br>
    <b>Abstract:</b> Large-scale multi-robot systems have numerous potential real-world applications. It is, however, still unclear how a human operator can effectively engage and control a system composed of multiple autonomous robots, especially in unstructured and outdoor environments. This paper reports on ongoing work in the project HERD --- Human-AI Collaboration: Engaging and Controlling Swarms of Robots and Drones, in which we focus on two concrete use cases from industrial partners, namely farming and search \& rescue. One of the industrial partners, Agro Intelligence ApS, currently sells autonomous farming robots, while the other, Robotto ApS, develops autonomous drone-based monitoring solutions for emergency responders. Both partners aim to scale their technologies to multi-robot/multi-drone operations. In this paper, we present the two use cases, their differences and similarities, challenges and preliminary results.
</details>

## Book chapters

<details>
    <summary>M.-T. O. Hoang, K. A. R. Grøntved, N. van Berkel, M. B. Skov, A. L. Christensen, and T. Merritt, <b>Drone swarms to support search and rescue operations: Opportunities and challenges</b>; Cultural Robotics: Social Robots and Their Emergent Cultural Ecologies, pp. 163–176, 2023.</summary>
    <br>
    <b>Abstract:</b> Emergency services organizations are committed to the challenging task of saving people in distress and minimizing harm across a wide range of events, including accidents, natural disasters, and search and rescue. The teams responsible for these operations use advanced equipment to support their missions. Given the risks and the time pressure of these missions, however, adopting new technologies requires careful testing and preparation. Drones have become a valuable technology in recent years for emergency services teams employed to locate people across vast and difficult to traverse terrains. These unmanned aerial vehicles are faster and cheaper to deploy than traditional crewed aircraft. While an individual drone can be helpful to personnel by quickly offering a bird's eye view, future scenarios may allow multiple drones working together as a swarm to reduce the time required to locate a person. Given these potentially high payoffs, we explored the challenges and opportunities of drone swarms in search and rescue operations. We conducted interviews as well as initial user studies with relevant stakeholders  to understand the challenges and opportunities for drone swarms in the context of search and rescue. Through this, we gained insights to inform the development of prototypes for drone swarm control interfaces, including both technical and human interaction concerns. While drone swarms can likely benefit search and rescue operations, the significant shift from single drones to swarms may necessitate re-imagining how rescue missions are conducted. We distill our findings into five key research challenges: visualization, situational awareness, technical issues, team culture, and public perception. We discuss initial steps to investigate these further.

</details>

## Thesis and Technical Reports

Master thesis: *"Multi-Agent Decentralised Coordination using CNRL for Industrial Applications"*

Bachelor thesis: *"Semantic segmentation using a deep neural network for pose estimation of a rigid object"*

## Work in progress

K. A. R. Grøntved, U. Schultz, A. L. Christensen (On-going), Thesis title: *Cooperative Control of Multirobot Systems in Real-World Applications*
