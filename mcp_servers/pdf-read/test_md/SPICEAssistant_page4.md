S. Nau _et al._ : SPICEAssistant: LLM using SPICE Simulation Tools for Schematic Design of Switched-Mode Power Supplies



put, derived from the typical application circuit found in the
datasheets of SMPS chips. In most cases these initial circuits
do not meet the desired specifications. Therefore, the task of
the agent is to modify the netlist to align with specific input
requirements given by an engineer.
In the setup shown in Figure 3, the standalone LLM GPT-4o
serves as baseline agent, depicted in grey, which directly outputs a modified netlist. To optimize its performance, we employ prompt engineering, providing tailored instructions. For
instance, we advise the agent to always include the adapted
netlist in its responses. Additionally, the phrase "Think step
by step." is incorporated, since it has been shown in [29] that
this can improve GPT’s performance.
The first extension of this baseline is depicted in orange.
GPT-4o is provided with specific information about the
SMPS used, sourced from the corresponding datasheet via
RAG. The LLM assistant’s instructions are adjusted accordingly to inform it, that it has access to the datasheet. The LLM
decides autonomously how often it retrieves information from
the datasheet.

The blue colored part in Figure 3 highlights a second extension to the baseline LLM agent. The LLM can receive sim


ulation feedback about the behavior of the circuit, allowing
it to estimate the impact of its modifications to the netlist.
This feedback helps to verify the netlist adaptions suggested
by the LLM, enhancing the reliability of the responses. The
interaction between the LLM and LTSpice simulation is enabled by a set of reading tools (python functions) that serve as
interface. In Section II-B, we pointed out, that GPT-4o can not
reliably extract features, like a ripple, from the output signal
of the LTSpice simulation. To address this, we developed a
comprehensive set of preimplemented tools to extract various features from the LTSpice output signals. The LLM can
access these tools and flexibly decide which tool to use and
how often to call upon it, based on the specific benchmark
question. Some of these tools are for example:


_•_ _get_mean_output_voltage()_
Calculates the mean over a time interval in the steady
state of the output voltage.

_•_ _get_ripple()_
Extracts the peak-to-peak value of a periodic signal in
the steady state, as discussed in Section II-B.

_•_ _get_switching_frequency()_
First, it performs a Fourier transform of the signal within












|Col1|Col2|Col3|
|---|---|---|
||||
|`V`<br>`C`<br>`R`<br>`X`<br>`I`<br>`L`<br>`R`<br>`R`<br>`C`<br>`.`<br>`.`|`1 IN 0 4`<br>`3 OUT2 0`<br>`load1 OU`<br>`U1 N004`<br>`N N001 I`<br>`TC3419`<br>`2 OUT1 N`<br>`3 N004 0`<br>`2 OUT1 N`<br>`tran 9m`<br>`end`|`.2`<br>` 10µ`<br>`T1 0 1200`<br>`IN 0 N002`<br>`N N003 0`<br>`004 59K`<br>` 59K`<br>`004 22p`|

























SPICE Interaction Datasheet Interaction Baseline Pipeline


**FIGURE 3.** Overview of the SPICEAssistant framework: An instructed GPT-4o agent serves as baseline, receiving a reference circuit and requirements as
input and directly outputs the adapted circuit netlist. The first extension enables information retrieval from datasheets using RAG. The second extension
equips the agent with several tools through which it can receive simulation feedback about specific circuit features


4


