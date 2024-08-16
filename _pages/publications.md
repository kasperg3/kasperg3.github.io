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

<!-- 
@inproceedings{grontved2024Automated,
title = "Automated Task Generation for Multi-Drone Search and Rescue Operations",
author = "Gr{\o}ntved, {Kasper Andreas R{\o}mer} and Anders Christensen and Maria-Theresa Bahodi",
year = "2024",
month = jun,
day = "28",
language = "Dansk",
journal = "Distributed Computing and Artificial Intelligence, 21st International Conference",
}


@inproceedings{grontved2024DSL,
    author    = {Kasper A. R. Grøntved and Jes Hundevadt Jepsen and Anders Lyhne Christensen and Kjeld Jensen and Ulrik Pagh Schultz Lundquist and Miguel~Campusano},
    title     = {Towards Autonomous Multi-UAV U-space Operation Planning},
    year      = { 2024 },
    booktitle={International Conference on Unmanned Aircraft Systems (ICUAS)}, 
    note      = {Under review},
}

@inproceedings{christensen2022herd,
  title={The HERD Project: Human-Multi-Robot Interaction in Search \& Rescue and in Farming},
  author={Christensen, Anders Lyhne and Gr{\o}ntved, Kasper Andreas R{\o}mer and Hoang, Maria-Theresa Oanh and van Berkel, Niels and Skov, Mikael and Scovill, Alea and Edwards, Gareth and Geipel, Kenneth Richard and Dalgaard, Lars and Lundquist, Ulrik Pagh Schultz and others},
  booktitle={Adjunct Proceedings of the IEEE/RSJ International Conference on Intelligent Robots and Systems},
  year={2022},
}

@inproceedings{grontved2022icar,
  title={Decentralized Multi-UAV Trajectory Task Allocation in Search and Rescue Applications},
  author={Gr{\o}ntved, Kasper Andreas R{\o}mer and  Schultz, Ulrik Pagh and Christensen, Anders Lyhne},
  booktitle={21st International Conference on Advanced Robotics},
  year={2023},
  organization={IEEE}
}

@article{hoang2023drone,
  title={Drone Swarms to Support Search and Rescue Operations: Opportunities and Challenges},
  author={Hoang, Maria-Theresa Oanh and Gr{\o}ntved, Kasper Andreas R{\o}mer and van Berkel, Niels and Skov, Mikael B and Christensen, Anders Lyhne and Merritt, Timothy},
  journal={Cultural Robotics: Social Robots and Their Emergent Cultural Ecologies},
  pages={163--176},
  year={2023},
  publisher={Springer}
} -->


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
