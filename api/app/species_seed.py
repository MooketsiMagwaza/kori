"""The species list, as reference data for the database (migration 0013 inserts it).

It must match the web apps' ``shared/species.ts`` row for row; ``tests/test_species_seed.py``
checks that. Columns: id, common name, Setswana name, scientific name, group, sensitivity.
Setswana names still need checking by a first-language speaker. The sensitive list is a proposal
for the prototype, to be agreed with the Department of Wildlife and National Parks.
"""

SPECIES: list[tuple[str, str, str | None, str, str, str]] = [
    ("elephant", "African elephant", "tlou", "Loxodonta africana", "mammal", "standard"),
    ("lion", "Lion", "tau", "Panthera leo", "mammal", "standard"),
    ("leopard", "Leopard", "nkwe", "Panthera pardus", "mammal", "standard"),
    ("cheetah", "Cheetah", "letlotse", "Acinonyx jubatus", "mammal", "standard"),
    ("wild-dog", "African wild dog", "leteane", "Lycaon pictus", "mammal", "standard"),
    ("spotted-hyena", "Spotted hyena", "phiri", "Crocuta crocuta", "mammal", "standard"),
    ("giraffe", "Giraffe", "thutlwa", "Giraffa camelopardalis", "mammal", "standard"),
    ("buffalo", "Cape buffalo", "nare", "Syncerus caffer", "mammal", "standard"),
    ("zebra", "Plains zebra", "pitse ya naga", "Equus quagga", "mammal", "standard"),
    ("hippo", "Hippopotamus", "kubu", "Hippopotamus amphibius", "mammal", "standard"),
    ("kudu", "Greater kudu", "tholo", "Tragelaphus strepsiceros", "mammal", "standard"),
    ("gemsbok", "Gemsbok", "kukama", "Oryx gazella", "mammal", "standard"),
    ("springbok", "Springbok", "tshepe", "Antidorcas marsupialis", "mammal", "standard"),
    ("wildebeest", "Blue wildebeest", "kgokong", "Connochaetes taurinus", "mammal", "standard"),
    ("impala", "Impala", "phala", "Aepyceros melampus", "mammal", "standard"),
    ("kori-bustard", "Kori bustard", "kgori", "Ardeotis kori", "bird", "standard"),
    ("ostrich", "Common ostrich", "ntšhwe", "Struthio camelus", "bird", "standard"),
    ("white-rhino", "White rhino", "tshukudu", "Ceratotherium simum", "mammal", "sensitive"),
    ("black-rhino", "Black rhino", "tshukudu", "Diceros bicornis", "mammal", "sensitive"),
    ("pangolin", "Temminck's pangolin", None, "Smutsia temminckii", "mammal", "sensitive"),
]
