import os, pandas as pd

base = r"C:\Users\ombhu\OneDrive\Desktop\DEKSTOP_\PROJECT\Health_Care\K_Health_Care\hackfusion3"
path = os.path.join(base, "Consumer Order History 1.csv")
out  = os.path.join(base, "inspect_out.txt")

with open(out, "w", encoding="utf-8") as f:
    # Read all rows (no header) to find where real headers are
    df_raw = pd.read_csv(path, encoding='latin-1', header=None, on_bad_lines='skip')
    f.write("ALL ROWS:\n")
    f.write(df_raw.to_string() + "\n")

print("Done, wrote to inspect_out.txt")
